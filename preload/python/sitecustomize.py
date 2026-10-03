# jetlag clock preload for Python, loaded by putting this directory first on
# PYTHONPATH. It moves the wall clock to JETLAG_NOW and lets it keep flowing.
# time.monotonic() and time.perf_counter() are untouched.

import os


def _install():
    import datetime as _dt
    import time as _time
    from datetime import timezone as _tz

    target = _dt.datetime.fromisoformat(os.environ["JETLAG_NOW"].replace("Z", "+00:00"))
    offset = target.timestamp() - float(os.environ["JETLAG_EPOCH"]) / 1000.0

    real_time, real_time_ns = _time.time, _time.time_ns
    real_localtime, real_gmtime = _time.localtime, _time.gmtime
    real_ctime, real_asctime, real_strftime = _time.ctime, _time.asctime, _time.strftime

    def time():
        return real_time() + offset

    def time_ns():
        return real_time_ns() + int(offset * 1_000_000_000)

    _time.time = time
    _time.time_ns = time_ns
    _time.localtime = lambda secs=None: real_localtime(time() if secs is None else secs)
    _time.gmtime = lambda secs=None: real_gmtime(time() if secs is None else secs)
    _time.ctime = lambda secs=None: real_ctime(time() if secs is None else secs)
    _time.asctime = lambda t=None: real_asctime(_time.localtime() if t is None else t)
    _time.strftime = lambda fmt, t=None: real_strftime(fmt, _time.localtime() if t is None else t)

    real_datetime, real_date = _dt.datetime, _dt.date

    class _DateMeta(type):
        def __instancecheck__(cls, obj):
            return isinstance(obj, real_date)

        def __subclasscheck__(cls, sub):
            return issubclass(sub, real_date)

    class _DatetimeMeta(_DateMeta):
        def __instancecheck__(cls, obj):
            return isinstance(obj, real_datetime)

        def __subclasscheck__(cls, sub):
            return issubclass(sub, real_datetime)

    class date(real_date, metaclass=_DateMeta):
        @classmethod
        def today(cls):
            return cls.fromtimestamp(time())

    class datetime(real_datetime, metaclass=_DatetimeMeta):
        @classmethod
        def now(cls, tz=None):
            return cls.fromtimestamp(time(), tz)

        @classmethod
        def today(cls):
            return cls.fromtimestamp(time())

        @classmethod
        def utcnow(cls):
            return cls.fromtimestamp(time(), _tz.utc).replace(tzinfo=None)

    date.__name__ = date.__qualname__ = "date"
    datetime.__name__ = datetime.__qualname__ = "datetime"
    date.__module__ = datetime.__module__ = "datetime"
    _dt.date, _dt.datetime = date, datetime

    marker = os.environ.get("JETLAG_MARKER")
    if marker:
        try:
            with open(marker, "a") as f:
                f.write("python\n")
        except OSError:
            pass


def _chain():
    # Run the sitecustomize this file shadows, if there is one.
    import importlib.util
    import sys

    here = os.path.dirname(os.path.abspath(__file__))
    for entry in sys.path:
        if not entry or os.path.abspath(entry) == here:
            continue
        candidate = os.path.join(entry, "sitecustomize.py")
        if os.path.isfile(candidate):
            spec = importlib.util.spec_from_file_location("_jetlag_shadowed_sitecustomize", candidate)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return


if os.environ.get("JETLAG_NOW") and os.environ.get("JETLAG_EPOCH"):
    try:
        _install()
    except Exception as error:  # never break the program under test
        import sys

        sys.stderr.write("jetlag: could not shift the Python clock: %s\n" % error)

try:
    _chain()
except Exception:
    pass
