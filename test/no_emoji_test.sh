#!/usr/bin/env bash
# No emoji in anything this image ships, nor in the template a new addon is born from.
#
#   ./test/no_emoji_test.sh
#
# THE HOST DRAWS NO EMOJI ANYWHERE (tinkerex docs/invariants/design-system.md rule 13, from its UX
# audit of 2026-11-01), and a bundle draws INSIDE the host's page — so a pictograph in a bundle is
# the host breaking its own rule from a file its own no_emoji_test can never read, because that scan
# stops at the host's tree. This one covers ours. It found the folder field's glyph, in all three
# bundles, on the day it was written.
#
# WHAT COUNTS: U+1F000-U+1FAFF (the pictograph blocks — a folder emoji is U+1F4C1), U+FE0F (the
# variation selector that turns a text glyph like a pencil into an emoji presentation) and U+200D
# (the zero-width joiner that glues emoji sequences together). Typographic glyphs the bundles use
# on purpose — a disclosure triangle, an arrow, an em dash — are not emoji and stay allowed.
#
# ONE EXEMPTION, AND IT IS NARROW: a manifest entry's `icon` VALUE. The key is REQUIRED (the host's
# Maker::Addons::Registry::REQUIRED skips an entry without it), it is an emoji by convention (the
# README's manifest table), and the host never draws it — the Tools gallery shows a monogram tile
# instead (tinkerex app/views/tools/home/_addon_mark.html.erb). Everything else in manifests.json —
# titles, descriptions, permission reasonings — IS drawn, so the rest of that file is walked string
# by string, keys included, rather than skipped.
#
# A FILE THAT IS NOT VALID UTF-8 IS NOT TEXT and is skipped: an emoji in anything a browser reads
# as text is a valid UTF-8 sequence, while an image's bytes can contain one by accident.
#
# THE SCANNED SET IS ASSERTED NON-EMPTY FIRST. A guard over a glob that matched nothing passes
# perfectly (tinkerex CLAUDE.md §14e), so the scan must have read the index and at least one module.
set -euo pipefail
cd "$(dirname "$0")/.."

# UTF-8 said explicitly (-E plus the magic comment), so this runs under a C/US-ASCII locale too.
ruby -Eutf-8:utf-8 -rjson -e '# encoding: utf-8
  EMOJI = /[\u{1F000}-\u{1FAFF}\u{FE0F}\u{200D}]/
  INDEX = "addons/manifests.json"

  files = Dir.glob(%w[addons/**/* templates/**/*], File::FNM_DOTMATCH).select { |f| File.file?(f) }.sort
  text_files = files.select { |f| File.binread(f).force_encoding("UTF-8").valid_encoding? }
  abort "FAIL: the scan read nothing under addons/ or templates/ — a guard over no files passes vacuously" if text_files.empty?
  abort "FAIL: #{INDEX} was not scanned" unless text_files.include?(INDEX)
  abort "FAIL: no .js module was scanned" unless text_files.any? { |f| f.end_with?(".js") }

  codes = ->(s) { s.scan(EMOJI).uniq.map { |c| format("U+%04X", c.ord) }.join(" ") }
  offenders = []

  (text_files - [INDEX]).each do |path|
    File.read(path).each_line.with_index(1) do |line, n|
      offenders << "#{path}:#{n}: #{codes.(line)}" if line.match?(EMOJI)
    end
  end

  # Walk the parsed index so the exemption is the `icon` VALUE of an entry and nothing else — not a
  # line that happens to start with "icon", not a title on the same line as one.
  walk = lambda do |node, where|
    case node
    when Hash
      node.each do |k, v|
        offenders << "#{INDEX}: key #{k.inspect} at #{where}: #{codes.(k)}" if k.match?(EMOJI)
        walk.(v, "#{where}.#{k}") unless where.match?(/\A\[\d+\]\z/) && k == "icon"
      end
    when Array then node.each_with_index { |v, i| walk.(v, "#{where}[#{i}]") }
    when String then offenders << "#{INDEX}: #{where}: #{codes.(node)}" if node.match?(EMOJI)
    end
  end
  index = JSON.parse(File.read(INDEX))
  abort "FAIL: #{INDEX} is not an array of manifests" unless index.is_a?(Array) && !index.empty?
  walk.(index, "")

  unless offenders.empty?
    warn "FAIL: emoji in what the addons image ships (the host draws none; this test explains why):"
    offenders.each { |o| warn "  #{o}" }
    warn "Use an inline SVG glyph (folder_field.js carries the folder glyph of the host) or a word instead."
    exit 1
  end
  puts "ok: no emoji in #{text_files.size} files under addons/ and templates/ (manifest icon values exempt)"
'
