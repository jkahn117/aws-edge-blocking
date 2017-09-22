
///////// SAMPLE CODE ONLY /////////

const util = require('util')
const { STATUS_CODES } = require('http')

// Environment Variables
const SESSION_ID_COOKIE_NAME = process.env.SESSION_ID_COOKIE_NAME
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

///
const cookieParser = new RegExp(`${SESSION_ID_COOKIE_NAME}=([^\\s;]*);`)

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
  console.log(util.inspect(event, { depth: 10 }))
  
  let request = event.Records[0].cf.request
  if (request.headers.cookie) {
    request.headers.cookie.some((cookie) => {
      if (cookie.value.indexOf(OVER_LIMIT_COOKIE_NAME) >= 0) {
        callback(null, rateLimit())
        return true
      } else if (cookie.value.indexOf(SESSION_ID_COOKIE_NAME) >= 0) {
        let m = cookie.value.match(cookieParser)

        request.headers['session-id'] = [{
          key:   'session-id',
          value: m[1]
        }]
      }
    })
  }

  callback(null, request)
}
