package expo.modules.videoexport

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer
import kotlin.math.max

/**
 * Stills plus a voice track -> one shareable mp4. The Android half of what
 * VideoExportModule.swift does on iOS.
 *
 * Deliberately not FFmpeg, for the same reasons as iOS: FFmpegKit was retired
 * in January 2025 with its binaries pulled that April, partly over codec patent
 * exposure. MediaCodec hands the work to the encoder Google already licensed
 * for this device, which makes the question theirs rather than ours.
 *
 * Same two-pass shape as iOS as well — encode a silent video from the images,
 * then mux the audio alongside it — because they are two different jobs and
 * interleaving two tracks against one clock is where this kind of code usually
 * goes wrong. Here the second pass is a MediaExtractor reading our own output
 * and the source audio into one MediaMuxer.
 */
class VideoExportModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VideoExport")

    AsyncFunction("export") { images: List<String>, audio: String?, seconds: Double, width: Int ->
      VideoExporter.run(images, audio, seconds, width)
    }

    // Cheap probe so JS can tell "not built into this binary" from "it failed",
    // which are very different things to show someone.
    Function("isAvailable") { true }
  }
}

private object VideoExporter {
  private const val MIME = MediaFormat.MIMETYPE_VIDEO_AVC
  private const val FPS = 30
  private const val IFRAME_INTERVAL = 1
  private const val TIMEOUT_US = 10_000L

  fun run(imagePaths: List<String>, audioPath: String?, secondsPerImage: Double, width: Int): String {
    require(imagePaths.isNotEmpty()) { "No frames were given to render." }

    // 9:16, and both even — H.264 macroblocks require it, and an odd height
    // fails inside the encoder rather than anywhere legible.
    val w = width - (width % 2)
    val h = (((w * 16.0 / 9.0).toInt()) / 2) * 2

    val silent = encodeSilent(imagePaths, secondsPerImage, w, h)

    val audioFile = audioPath?.let(::File)
    if (audioFile == null || !audioFile.exists()) return silent.absolutePath

    return mux(silent, audioFile).absolutePath
  }

  private fun temp(suffix: String): File =
    File.createTempFile("saydle-", suffix)

  private fun encodeSilent(imagePaths: List<String>, secondsPerImage: Double, w: Int, h: Int): File {
    val out = temp(".mp4")

    val format = MediaFormat.createVideoFormat(MIME, w, h).apply {
      setInteger(
        MediaFormat.KEY_COLOR_FORMAT,
        MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface,
      )
      setInteger(MediaFormat.KEY_BIT_RATE, w * h * 4)
      setInteger(MediaFormat.KEY_FRAME_RATE, FPS)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, IFRAME_INTERVAL)
    }

    val codec = MediaCodec.createEncoderByType(MIME)
    codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)

    // Drawing through the encoder's own input Surface rather than pushing byte
    // buffers: it avoids having to match whichever YUV layout this particular
    // device wants, which varies by chipset and is a classic source of green
    // or sheared output.
    val surface = codec.createInputSurface()
    codec.start()

    val muxer = MediaMuxer(out.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var trackIndex = -1
    var muxing = false

    val info = MediaCodec.BufferInfo()
    val framesPerImage = max(1, (secondsPerImage * FPS).toInt())
    val frameDurationUs = 1_000_000L / FPS
    var frameIndex = 0L

    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)

    fun drain(endOfStream: Boolean) {
      while (true) {
        val status = codec.dequeueOutputBuffer(info, if (endOfStream) TIMEOUT_US else 0L)

        when {
          status == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!endOfStream) return
          status == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            // The real format only exists once the encoder has seen data; the
            // muxer cannot be started before it.
            trackIndex = muxer.addTrack(codec.outputFormat)
            muxer.start()
            muxing = true
          }
          status >= 0 -> {
            val encoded: ByteBuffer = codec.getOutputBuffer(status) ?: continue

            // Codec config bytes belong in the track format, not the stream.
            if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0

            if (info.size > 0 && muxing) {
              encoded.position(info.offset)
              encoded.limit(info.offset + info.size)
              muxer.writeSampleData(trackIndex, encoded, info)
            }

            codec.releaseOutputBuffer(status, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
          }
        }
      }
    }

    try {
      for (path in imagePaths) {
        val bitmap = BitmapFactory.decodeFile(path)
          ?: throw IllegalArgumentException("Could not read an image at $path.")

        repeat(framesPerImage) {
          drain(false)

          val canvas = surface.lockCanvas(null)
          try {
            // Fill first: a card narrower than 9:16 would otherwise letterbox
            // onto whatever the buffer happened to contain.
            canvas.drawColor(Color.BLACK)

            // Aspect-fill, centred — the share card is authored at this ratio,
            // so this is a safety net rather than the normal path.
            val scale = max(w.toFloat() / bitmap.width, h.toFloat() / bitmap.height)
            val dw = (bitmap.width * scale).toInt()
            val dh = (bitmap.height * scale).toInt()
            val left = (w - dw) / 2
            val top = (h - dh) / 2

            canvas.drawBitmap(
              bitmap,
              Rect(0, 0, bitmap.width, bitmap.height),
              Rect(left, top, left + dw, top + dh),
              paint,
            )
          } finally {
            surface.unlockCanvasAndPost(canvas)
          }

          frameIndex += 1
        }

        bitmap.recycle()
      }

      codec.signalEndOfInputStream()
      drain(true)
    } finally {
      codec.stop()
      codec.release()
      surface.release()
      if (muxing) muxer.stop()
      muxer.release()
    }

    // Referenced so the frame count is not silently unused; the timing comes
    // from the input surface's own presentation clock.
    check(frameIndex > 0) { "No frames were written." }
    return out
  }

  private fun mux(video: File, audio: File): File {
    val out = temp(".mp4")
    val muxer = MediaMuxer(out.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

    val videoExtractor = MediaExtractor().apply { setDataSource(video.absolutePath) }
    val audioExtractor = MediaExtractor().apply { setDataSource(audio.absolutePath) }

    try {
      val videoTrack = selectTrack(videoExtractor, "video/")
        ?: throw IllegalStateException("The rendered video had no video track.")
      val outVideo = muxer.addTrack(videoExtractor.getTrackFormat(videoTrack))

      val audioTrack = selectTrack(audioExtractor, "audio/")
      val outAudio = audioTrack?.let { muxer.addTrack(audioExtractor.getTrackFormat(it)) }

      muxer.start()

      val videoDurationUs = copyTrack(videoExtractor, muxer, outVideo, Long.MAX_VALUE)

      // Clamped to the video: a voice track longer than the pictures would
      // leave the file running against a frozen frame.
      if (audioTrack != null && outAudio != null) {
        copyTrack(audioExtractor, muxer, outAudio, videoDurationUs)
      }

      muxer.stop()
    } finally {
      muxer.release()
      videoExtractor.release()
      audioExtractor.release()
    }

    video.delete()
    return out
  }

  private fun selectTrack(extractor: MediaExtractor, prefix: String): Int? {
    for (i in 0 until extractor.trackCount) {
      val mime = extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME) ?: continue
      if (mime.startsWith(prefix)) {
        extractor.selectTrack(i)
        return i
      }
    }
    return null
  }

  /** Copies samples up to `limitUs`, returning the last timestamp written. */
  private fun copyTrack(
    extractor: MediaExtractor,
    muxer: MediaMuxer,
    outTrack: Int,
    limitUs: Long,
  ): Long {
    val buffer = ByteBuffer.allocate(1 shl 20)
    val info = MediaCodec.BufferInfo()
    var lastUs = 0L

    while (true) {
      val size = extractor.readSampleData(buffer, 0)
      if (size < 0) break

      val timeUs = extractor.sampleTime
      if (timeUs > limitUs) break

      info.offset = 0
      info.size = size
      info.presentationTimeUs = timeUs
      info.flags = extractor.sampleFlags

      muxer.writeSampleData(outTrack, buffer, info)
      lastUs = timeUs
      extractor.advance()
    }

    return lastUs
  }
}
