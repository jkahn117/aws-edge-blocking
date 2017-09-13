
///////// SAMPLE CODE ONLY /////////

const util = require('util')
const { STATUS_CODES } = require('http')

// Environment Variables
const TABLE_NAME = process.env.TABLE_NAME
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
  
  const request = event.Records[0].cf.request
  if (request.headers.cookie) {
    request.headers.cookie.some((cookie) => {
      if (cookie.indexOf(OVER_LIMIT_COOKIE_NAME) >= 0) {
        callback(null, rateLimit())
        return true
      }
    })
  }

  callback(null, request)
}
