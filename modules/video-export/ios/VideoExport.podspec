Pod::Spec.new do |s|
  s.name           = 'VideoExport'
  s.version        = '1.0.0'
  s.summary        = 'Stills plus a voice track into one mp4, via AVAssetWriter.'
  s.description    = 'Uses the encoder the device already licenses, so no FFmpeg and no codec patent exposure.'
  s.author         = 'Saydle'
  s.homepage       = 'https://saydle.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
