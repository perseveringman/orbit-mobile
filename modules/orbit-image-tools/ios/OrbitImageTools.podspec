Pod::Spec.new do |s|
  s.name           = 'OrbitImageTools'
  s.version        = '0.0.0'
  s.summary        = 'Orbit Mobile local image processing'
  s.description    = 'Provides local image resize and JPEG compression for Orbit Mobile.'
  s.author         = 'Orbit Contributors'
  s.homepage       = 'https://github.com/perseveringman/orbit-mobile'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/perseveringman/orbit-mobile.git' }
  s.static_framework = true
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.dependency 'ExpoModulesCore'
  s.swift_version  = '5.0'
end
