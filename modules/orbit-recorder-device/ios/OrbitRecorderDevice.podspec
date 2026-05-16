Pod::Spec.new do |s|
  s.name           = 'OrbitRecorderDevice'
  s.version        = '0.0.0'
  s.summary        = 'Orbit Mobile BLE bridge for Newman X1 recorder imports'
  s.description    = 'Connects to the Newman X1 recorder over BLE and imports audio into Orbit Mobile local capture.'
  s.author         = 'Orbit Contributors'
  s.homepage       = 'https://github.com/perseveringman/orbit-mobile'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/perseveringman/orbit-mobile.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
