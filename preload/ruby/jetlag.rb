# jetlag clock preload for Ruby, loaded through RUBYOPT=-r. It moves Time.now,
# Date.today, and DateTime.now to JETLAG_NOW and lets the clock keep flowing.

if ENV['JETLAG_NOW'] && ENV['JETLAG_EPOCH']
  begin
    require 'time'
    require 'date'

    module Jetlag
      OFFSET = Time.iso8601(ENV['JETLAG_NOW']).to_r - Rational(Integer(ENV['JETLAG_EPOCH']), 1000)
    end

    class << Time
      alias_method :__jetlag_real_now, :now

      def now(*args, **opts)
        real = opts.empty? ? __jetlag_real_now(*args) : __jetlag_real_now(*args, **opts)
        real + Jetlag::OFFSET
      end
    end

    class << Date
      alias_method :__jetlag_real_today, :today

      def today(start = Date::ITALY)
        Time.now.to_date.new_start(start)
      end
    end

    class << DateTime
      alias_method :__jetlag_real_now, :now

      def now(start = Date::ITALY)
        Time.now.to_datetime.new_start(start)
      end
    end

    if (marker = ENV['JETLAG_MARKER'])
      File.open(marker, 'a') { |f| f.write("ruby\n") } rescue nil
    end
  rescue StandardError => e
    warn "jetlag: could not shift the Ruby clock: #{e.message}"
  end
end
