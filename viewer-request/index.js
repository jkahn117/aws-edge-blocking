
///////// SAMPLE CODE ONLY /////////

const util = require('util')
const { STATUS_CODES } = require('http')

// Environment Variables
const OVER_LIMIT_COOKIE_NAME = process.env.OVER_LIMIT_COOKIE_NAME

/**
 * Returns a response of "Too Many Requests"
 * 
 * @return {[type]}    [description]
 */
function rateLimit () {
  return {
    status: '429',
    statusDescription: STATUS_CODES['429']
  }
}

/**
 * Appends a header to the returned request ('x-edge-blocking-result') with
 * provided message.
 * @param  {[type]} request request object
 * @param  {[type]} message message for result
 * @return {[type]}         updated request
 */
function appendResultHeaderTo (request, message) {
  if (!request) {
    return
  }

  request.headers['x-edge-blocking-viewer-request-result'] = message
  return request
}

/**
 * Check for existence of cookie (e.g. SESSION_OVER_LIMIT) and reject
 * requests (return 429 response code) from clients on which the value is set
 * to true.
 * 
 * @param  event
 * @param  context
 * @param  callback
 */
exports.handler = (event, context, callback) => {
  // console.log(util.inspect(event, { depth: 5 }))
  
  let request = event.Records[0].cf.request
  if (request.headers.cookie) {
    request.headers.cookie.some((cookie) => {
      if (cookie.indexOf(OVER_LIMIT_COOKIE_NAME) >= 0) {
        callback(null, rateLimit())
        return true
      }
    })
  } else {
    request = appendResultHeaderTo(request, 'No over limit cookie present, proceeding')
  }

  callback(null, request)
}
