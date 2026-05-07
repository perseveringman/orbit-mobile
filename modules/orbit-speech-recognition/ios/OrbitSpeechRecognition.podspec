Pod::Spec.new do |s|
  s.name           = 'OrbitSpeechRecognition'
  s.version        = '0.0.0'
  s.summary        = 'Orbit Mobile speech recognition bridge'
  s.description    = 'Provides iOS Speech framework live transcription for Orbit Mobile capture.'
  s.author         = 'Orbit Contributors'
  s.homepage       = 'https://github.com/perseveringman/orbit-mobile'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/perseveringman/orbit-mobile.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
end
