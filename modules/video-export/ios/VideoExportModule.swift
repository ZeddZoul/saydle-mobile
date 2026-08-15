import ExpoModulesCore
import AVFoundation
import UIKit

/**
 * Stills + a voice track -> one shareable mp4.
 *
 * Deliberately not FFmpeg. FFmpegKit was retired in January 2025 and its
 * binaries pulled that April, partly over codec patent exposure — inheriting
 * someone else's H.264 licensing question for a share button is a bad trade.
 * AVAssetWriter uses the encoder Apple already licensed for this device, which
 * makes the question somebody else's problem entirely.
 *
 * Two passes rather than one, because they are two different jobs. The first
 * writes a silent video from the images; the second lays the audio alongside it
 * in a composition and exports. Writing audio samples into the first pass means
 * interleaving two inputs against one clock, which is where this kind of code
 * usually goes wrong.
 */
private enum ExportError: Error, LocalizedError {
  case noImages
  case badImage(String)
  case writerFailed(String)
  case noVideoTrack
  case exportFailed(String)

  var errorDescription: String? {
    switch self {
    case .noImages: return "No frames were given to render."
    case .badImage(let p): return "Could not read an image at \(p)."
    case .writerFailed(let m): return "Writing the video failed: \(m)"
    case .noVideoTrack: return "The rendered video had no video track."
    case .exportFailed(let m): return "Muxing audio failed: \(m)"
    }
  }
}

public class VideoExportModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VideoExport")

    /**
     * `images`   file paths, in order — one per affirmation
     * `audio`    optional file path; when nil the result is silent
     * `seconds`  how long each still is held
     * `size`     output width (height follows 9:16)
     */
    AsyncFunction("export") {
      (images: [String], audio: String?, seconds: Double, width: Int) -> String in
      try await VideoExporter.run(
        imagePaths: images,
        audioPath: audio,
        secondsPerImage: seconds,
        width: width
      )
    }

    // Cheap probe so JS can tell "not built into this binary" from "it failed",
    // which are very different things to show someone.
    Function("isAvailable") { () -> Bool in true }
  }
}

private enum VideoExporter {
  static func run(
    imagePaths: [String],
    audioPath: String?,
    secondsPerImage: Double,
    width: Int
  ) async throws -> String {
    guard !imagePaths.isEmpty else { throw ExportError.noImages }

    // 9:16, and even numbers — H.264 macroblocks require it and an odd height
    // fails at the encoder rather than anywhere useful.
    let w = width - (width % 2)
    let h = (Int(Double(w) * 16.0 / 9.0) / 2) * 2

    let silent = try await writeSilentVideo(
      imagePaths: imagePaths,
      secondsPerImage: secondsPerImage,
      size: CGSize(width: w, height: h)
    )

    guard let audioPath, FileManager.default.fileExists(atPath: audioPath) else {
      return silent.path
    }

    return try await mux(video: silent, audio: URL(fileURLWithPath: audioPath)).path
  }

  private static func tempURL(_ ext: String) -> URL {
    let name = "saydle-\(UUID().uuidString).\(ext)"
    return URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(name)
  }

  private static func writeSilentVideo(
    imagePaths: [String],
    secondsPerImage: Double,
    size: CGSize
  ) async throws -> URL {
    let out = tempURL("mp4")

    let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
    let input = AVAssetWriterInput(
      mediaType: .video,
      outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: Int(size.width),
        AVVideoHeightKey: Int(size.height),
      ]
    )
    input.expectsMediaDataInRealTime = false

    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: input,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32ARGB),
        kCVPixelBufferWidthKey as String: Int(size.width),
        kCVPixelBufferHeightKey as String: Int(size.height),
      ]
    )

    guard writer.canAdd(input) else { throw ExportError.writerFailed("cannot add video input") }
    writer.add(input)
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)

    // 30fps is plenty for stills; the frames are identical within a page.
    let fps: Int32 = 30
    var frame: Int64 = 0
    let framesPerImage = Int64(max(1, Int(secondsPerImage * Double(fps))))

    for path in imagePaths {
      guard let image = UIImage(contentsOfFile: path) else {
        writer.cancelWriting()
        throw ExportError.badImage(path)
      }

      guard let buffer = pixelBuffer(from: image, size: size, pool: adaptor.pixelBufferPool) else {
        writer.cancelWriting()
        throw ExportError.badImage(path)
      }

      for _ in 0..<framesPerImage {
        // Back-pressure: appending while the input is full silently drops
        // frames, which shows up as a video that is shorter than its audio.
        while !input.isReadyForMoreMediaData {
          try await Task.sleep(nanoseconds: 5_000_000)
        }

        adaptor.append(buffer, withPresentationTime: CMTime(value: frame, timescale: fps))
        frame += 1
      }
    }

    input.markAsFinished()
    await writer.finishWriting()

    if writer.status != .completed {
      throw ExportError.writerFailed(writer.error?.localizedDescription ?? "unknown")
    }

    return out
  }

  private static func pixelBuffer(
    from image: UIImage,
    size: CGSize,
    pool: CVPixelBufferPool?
  ) -> CVPixelBuffer? {
    var buffer: CVPixelBuffer?

    if let pool {
      CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &buffer)
    } else {
      CVPixelBufferCreate(
        kCFAllocatorDefault, Int(size.width), Int(size.height),
        kCVPixelFormatType_32ARGB, nil, &buffer
      )
    }

    guard let buffer else { return nil }

    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

    guard
      let context = CGContext(
        data: CVPixelBufferGetBaseAddress(buffer),
        width: Int(size.width),
        height: Int(size.height),
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
      ), let cg = image.cgImage
    else { return nil }

    // Fill first: a card narrower than 9:16 would otherwise letterbox onto
    // whatever the buffer happened to contain.
    context.setFillColor(UIColor.black.cgColor)
    context.fill(CGRect(origin: .zero, size: size))

    // Aspect-fill, centred — the share card is authored at this ratio, so this
    // is a safety net rather than the normal path.
    let scale = max(size.width / image.size.width, size.height / image.size.height)
    let drawn = CGSize(width: image.size.width * scale, height: image.size.height * scale)
    context.draw(
      cg,
      in: CGRect(
        x: (size.width - drawn.width) / 2,
        y: (size.height - drawn.height) / 2,
        width: drawn.width,
        height: drawn.height
      )
    )

    return buffer
  }

  private static func mux(video: URL, audio: URL) async throws -> URL {
    let composition = AVMutableComposition()
    let videoAsset = AVURLAsset(url: video)
    let audioAsset = AVURLAsset(url: audio)

    guard
      let videoSource = try await videoAsset.loadTracks(withMediaType: .video).first,
      let videoTrack = composition.addMutableTrack(
        withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
    else { throw ExportError.noVideoTrack }

    let duration = try await videoAsset.load(.duration)
    try videoTrack.insertTimeRange(
      CMTimeRange(start: .zero, duration: duration), of: videoSource, at: .zero)

    if let audioSource = try await audioAsset.loadTracks(withMediaType: .audio).first,
      let audioTrack = composition.addMutableTrack(
        withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
    {
      // Clamp to the video: a voice track longer than the pictures would leave
      // the export running against a frozen frame.
      let audioDuration = try await audioAsset.load(.duration)
      let use = CMTimeMinimum(duration, audioDuration)
      try audioTrack.insertTimeRange(
        CMTimeRange(start: .zero, duration: use), of: audioSource, at: .zero)
    }

    let out = tempURL("mp4")
    guard
      let session = AVAssetExportSession(
        asset: composition, presetName: AVAssetExportPresetHighestQuality)
    else { throw ExportError.exportFailed("no export session") }

    session.outputURL = out
    session.outputFileType = .mp4

    await session.export()

    guard session.status == .completed else {
      throw ExportError.exportFailed(session.error?.localizedDescription ?? "unknown")
    }

    try? FileManager.default.removeItem(at: video)
    return out
  }
}
