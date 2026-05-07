#!/usr/bin/env ruby
# frozen_string_literal: true

require 'xcodeproj'

PROJECT_PATH = 'ios/OrbitMobile.xcodeproj'
APP_GROUP = 'group.com.zhouyanbo.orbit.capture'
TEAM_ID = '9L67H7PVDT'

project = Xcodeproj::Project.open(PROJECT_PATH)
app_target = project.targets.find { |target| target.name == 'OrbitMobile' }
raise 'OrbitMobile target not found' unless app_target

def ensure_group(project, name)
  group = project.main_group[name]
  return group if group

  project.main_group.new_group(name, name)
end

def ensure_file(group, path)
  relative_path = path.start_with?("#{group.path}/") ? path.delete_prefix("#{group.path}/") : path
  existing = group.files.find { |file| file.path == relative_path || file.display_name == File.basename(relative_path) }
  if existing
    existing.path = relative_path
    return existing
  end

  group.new_file(relative_path)
end

def ensure_target(project, name, bundle_id, plist, entitlements, file_paths, framework_names)
  target = project.targets.find { |candidate| candidate.name == name }
  target ||= project.new_target(:app_extension, name, :ios, '15.1')
  target.product_reference.path = "#{name}.appex"
  target.product_reference.name = "#{name}.appex"

  target.build_configurations.each do |config|
    config.build_settings['ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS'] = 'YES'
    config.build_settings['CODE_SIGN_ENTITLEMENTS'] = entitlements
    config.build_settings['CURRENT_PROJECT_VERSION'] = '1'
    config.build_settings['DEVELOPMENT_TEAM'] = TEAM_ID
    config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
    config.build_settings['INFOPLIST_FILE'] = plist
    config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
    config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'
    config.build_settings['MARKETING_VERSION'] = '0.0.0'
    config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = bundle_id
    config.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
    config.build_settings['SKIP_INSTALL'] = 'YES'
    config.build_settings['SWIFT_VERSION'] = '5.0'
    config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  end

  group = ensure_group(project, name)
  file_paths.each do |path|
    file_ref = ensure_file(group, path)
    target.add_file_references([file_ref]) if File.extname(path) == '.swift'
  end
  target.source_build_phase.files.each do |build_file|
    file = build_file.file_ref
    next if file&.path&.end_with?('.swift') || build_file.display_name.end_with?('.swift')

    target.source_build_phase.remove_build_file(build_file)
  end

  framework_group = project.frameworks_group
  framework_names.each do |framework_name|
    file_ref = framework_group.files.find { |file| file.display_name == framework_name }
    file_ref ||= framework_group.new_file("System/Library/Frameworks/#{framework_name}")
    target.frameworks_build_phase.add_file_reference(file_ref, true)
  end

  target
end

share_target = ensure_target(
  project,
  'OrbitShareExtension',
  'com.zhouyanbo.orbit.capture.share',
  'OrbitShareExtension/Info.plist',
  'OrbitShareExtension/OrbitShareExtension.entitlements',
  [
    'OrbitShareExtension/ShareViewController.swift',
    'OrbitShareExtension/Info.plist',
    'OrbitShareExtension/OrbitShareExtension.entitlements'
  ],
  ['UniformTypeIdentifiers.framework']
)

widget_target = ensure_target(
  project,
  'OrbitWidgets',
  'com.zhouyanbo.orbit.capture.widgets',
  'OrbitWidgets/Info.plist',
  'OrbitWidgets/OrbitWidgets.entitlements',
  [
    'OrbitWidgets/OrbitWidgets.swift',
    'OrbitWidgets/Info.plist',
    'OrbitWidgets/OrbitWidgets.entitlements'
  ],
  ['WidgetKit.framework', 'SwiftUI.framework']
)

embed_phase = app_target.copy_files_build_phases.find { |phase| phase.display_name == 'Embed App Extensions' }
embed_phase ||= app_target.new_copy_files_build_phase('Embed App Extensions')
embed_phase.dst_subfolder_spec = '13'

[share_target, widget_target].each do |target|
  app_target.add_dependency(target) unless app_target.dependencies.any? { |dep| dep.target == target }
  next if embed_phase.files_references.include?(target.product_reference)

  build_file = embed_phase.add_file_reference(target.product_reference)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end

project.save
