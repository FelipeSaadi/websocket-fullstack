import pino from 'pino'
import * as Sentry from '@sentry/nextjs'

const isDevelopment = process.env.NODE_ENV !== 'production'
const isServer = typeof window === 'undefined'

if (!isDevelopment) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "https://your-sentry-dsn-here@o0.ingest.sentry.io/0",
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV,
  });
}

const serializers = {
  err: (err) => {
    return {
      type: err.constructor.name,
      message: err.message,
      stack: isDevelopment ? err.stack : undefined,
      code: err.code,
      statusCode: err.statusCode
    }
  },
  req: (req) => {
    return {
      method: req.method,
      url: req.url,
      headers: isDevelopment ? req.headers : undefined,
      remoteAddress: req.remoteAddress
    }
  },
  res: (res) => {
    return {
      statusCode: res.statusCode
    }
  }
}

const messageCache = new Map()
const memoizedFormat = (obj) => {
  const key = JSON.stringify(obj)
  if (!messageCache.has(key)) {
    messageCache.set(key, obj)
    if (messageCache.size > 1000) {
      const firstKey = messageCache.keys().next().value
      messageCache.delete(firstKey)
    }
  }
  return messageCache.get(key)
}

const devConfig = {
  browser: {
    asObject: true,
    write: {
      level: (level) => {
        const timestamp = new Date().toISOString()
        return {
          level: level.toUpperCase(),
          time: timestamp
        }
      },
      transmit: (level, logEvent) => {
        const { time, level: levelLabel, ...rest } = logEvent
        const color = getColorForLevel(level)
        
        console.log(
          `%c[${new Date(time).toLocaleTimeString()}] %c${levelLabel}%c:`,
          'color: gray; font-weight: bold',
          `color: ${color}; font-weight: bold`,
          'color: inherit',
          ...Object.values(rest)
        )
      }
    },
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() }
      },
      bindings: () => {
        return { env: process.env.NODE_ENV, context: isServer ? 'server' : 'browser' }
      },
      log: (object) => {
        return { ...object, timestamp: new Date().toLocaleString() }
      }
    }
  },
  level: 'trace',
  serializers,
  base: { pid: undefined, hostname: undefined }
}

const prodConfig = {
  browser: {
    asObject: true,
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() }
      }
    },
    transmit: {
      level: 'warn',
      send: (level, logEvent) => {
        console[level](`[${level.toUpperCase()}]`, ...Object.values(logEvent));
        
        if (['warn', 'error', 'fatal'].includes(level)) {
          const { messages, bindings } = logEvent;
          const message = messages.join(' ');
          
          if (level === 'error' || level === 'fatal') {
            Sentry.captureException(new Error(message), {
              level: level,
              extra: bindings
            });
          } else {
            Sentry.captureMessage(message, {
              level: 'warning',
              extra: bindings
            });
          }
        }
      }
    }
  },
  level: 'warn',
  hooks: {
    logMethod(inputArgs, method) {
      if (!isDevelopment && isServer) {
        const level = this.level;
        if (level === 'error' || level === 'fatal') {
          const [msg, ...args] = inputArgs;
          Sentry.captureException(new Error(msg), {
            level: level,
            extra: { args }
          });
        } else if (level === 'warn') {
          const [msg, ...args] = inputArgs;
          Sentry.captureMessage(msg, {
            level: 'warning',
            extra: { args }
          });
        }
      }
      return method.apply(this, inputArgs);
    }
  },
  serializers,
  base: null,
  timestamp: false,
  redact: ['password', 'secret', 'token', 'authorization', 'cookie']
}

function getColorForLevel(level) {
  const colors = {
    trace: '#6c757d',
    debug: '#0dcaf0',
    info: '#0d6efd',
    warn: '#ffc107',
    error: '#dc3545',
    fatal: '#7f1d1d'
  }
  return colors[level] || 'inherit'
}

const baseLogger = pino(isDevelopment ? devConfig : prodConfig)

const logger = {
  trace: (...args) => {
    if (isDevelopment && args.length > 1 && typeof args[1] === 'object') {
      args[1] = memoizedFormat(args[1])
    }
    return baseLogger.trace(...args)
  },
  debug: (...args) => {
    if (isDevelopment && args.length > 1 && typeof args[1] === 'object') {
      args[1] = memoizedFormat(args[1])
    }
    return baseLogger.debug(...args)
  },
  info: (...args) => baseLogger.info(...args),
  warn: (...args) => baseLogger.warn(...args),
  error: (...args) => baseLogger.error(...args),
  fatal: (...args) => baseLogger.fatal(...args),
  child: (bindings) => baseLogger.child(bindings)
}

/**
 * Logger configured for:
 * - Development: verbose logs (trace, debug, info, warn, error, fatal) in console
 * - Production: critical logs (warn, error, fatal) sent to Sentry
 * 
 * Usage examples:
 * logger.trace('Detailed information', { data });  // Only in development
 * logger.debug('Debug information', { id });  // Only in development
 * logger.info('Normal events', { user });  // Only in development
 * logger.warn('Important warnings', { issue });  // In all environments + Sentry in production
 * logger.error('Critical errors', { error });  // In all environments + Sentry in production
 * logger.fatal('Fatal errors', { crash });  // In all environments + Sentry in production
 * 
 * // Create a child logger with context
 * const moduleLogger = logger.child({ module: 'auth' })
 * moduleLogger.info('User logged in')  // Will include module: 'auth' in all logs
 */

export default logger