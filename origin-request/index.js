
///////// SAMPLE CODE ONLY /////////

const AWS = require('aws-sdk')
const util = require('util')
const { STATUS_CODES } = require('http')

const ddb = new AWS.DynamoDB.DocumentClient()

/// Environment Variables
const TABLE_NAME = (process.env.AWS_SAM_LOCAL) ? 'edge-blocking' : process.env.TABLE_NAME
const SESSION_ID_COOKIE_NAME = process.env.SESSION_ID_COOKIE_NAME
const OVER_LIMIT_COOKIE_NAME = process.env.OVER_LIMIT_COOKIE_NAME
const OVER_LIMIT_THRESHOLD = Number(process.env.OVER_LIMIT_THRESHOLD)
const OVER_LIMIT_TIMEOUT = Number(process.env.OVER_LIMIT_TIMEOUT)

///
function OverLimitError() {}
OverLimitError.prototype = Object.create(Error.prototype)
OverLimitError.constructor = OverLimitError

/**
 * Returns a response of "Too Many Requests"
 * @return {[type]}    429 response
 */
function rateLimit () {
  return {
    status: '429',
    statusDescription: STATUS_CODES['429'],
    headers: {
      'set-cookie': {
        'key': 'Set-Cookie',
        'value': `${OVER_LIMIT_COOKIE_NAME}=true; secure; path=/; max-age=${OVER_LIMIT_THRESHOLD * 60 * 60}`
    }
  }
}


///
const cookieParser = new RegExp(`${SESSION_ID_COOKIE_NAME}=([^\\s;]*);`)

/**
 * Retrieves the session id (as identified by SESSION_ID_COOKIE_NAME)
 * value from cookies in the request
 * @param  {[type]} request incoming http request
 * @return {[type]}         session id or null if not found
 */
function sessionIdFromCookie (request) {
  let sessionId = null

  if (request.headers.cookie) {
    request.headers.cookie.forEach((cookie) => {
      if (cookie.value.indexOf(SESSION_ID_COOKIE_NAME) >= 0) {
        let m = cookie.value.match(cookieParser)
        return sessionId = m[1]
      }
    })
  }

  return sessionId
}

/**
 * Standard key for records that combines the session id and request uri.
 * @param  {[type]} request http request
 * @return {[type]}         client key
 */
function clientKeyFor (request) {
  let sessionId = sessionIdFromCookie(request)

  if (sessionId) {
    return `${sessionId}++${request.uri}`
  } else {
    return null
  }
}

/**
 * Creates a new record in DynamoDB table for the passed key and record.
 * @param  {[type]} key     unique identified for client + uri
 * @param  {[type]} request http request
 * @return {[type]}         Promise
 */
function createRecordFor (key, request) {
  let params = {
    TableName: TABLE_NAME,
    Item: {
      clientKey: key,
      timestamp: Date.now(),
      lastTimestamp: Date.now(),
      count: 1,
      sessionId: sessionIdFromCookie(request),
      uri: request.uri
    }
  }

  return ddb.put(params).promise()
}

/**
 * Deletes the item of the passed record in DynamoDB.
 * @param  {[type]} record record to be deleted
 * @return {[type]}        Promise
 */
function deleteRecord (record) {
  let params = {
    TableName: TABLE_NAME,
    Key: { clientKey: record.clientKey, timestamp: record.timestamp },
  }

  return ddb.delete(params).promise()
}

/**
 * Increments the count of the passed record in DynamoDB.
 * @param  {[type]} record record to be incremented
 * @return {[type]}        Promise
 */
function incrementCountFor (record) {
  let params = {
    TableName: TABLE_NAME,
    Key: { clientKey: record.clientKey, timestamp: record.timestamp },
    UpdateExpression: 'set #count = :c, #lt = :t',
    ExpressionAttributeNames: { '#count': 'count', '#lt': 'lastTimestamp' },
    ExpressionAttributeValues: { ':c': record.count + 1, ':t': Date.now() }
  }

  return ddb.update(params).promise()
}

/**
 * Interrogates the record retrieved from DynamoDB and determines if
 * the current request is over the defined time or count thresholds.
 *
 * TODO: currently works on a fixed window from when the record was
 * created, but could be made to slide window
 * 
 * @param  {[type]} key    identifier for the client + uri
 * @param  {[type]} record last record for client
 * @return {[type]}        Promise
 */
function examineRecord (key, record) {
  let now = Date.now()
  let secondsSinceLastRecord = (now - record.lastTimestamp) / 1000
  let secondsSinceRecord = (now - record.timestamp) / 1000
  let requestsInTimePeriod = (record.count + 1) / secondsSinceRecord

  if (secondsSinceLastRecord > OVER_LIMIT_TIMEOUT) {
    console.log('Deleting record')
    return deleteRecord(record)
  } else if (requestsInTimePeriod >= OVER_LIMIT_THRESHOLD) {
    console.log('Over threshold')
    return incrementCountFor(record).then(() => {
      throw new OverLimitError()
    })
  } else {
    console.log('Incrementing record')
    return incrementCountFor(record)
  }
}

/**
 * Retrieves the last record from DynamoDB for the client id + uri
 * @param  {[type]} key identifier client id + uri
 * @return {[type]}     Promise (result is record)
 */
function getLastRecordFor (key) {
  let params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'clientKey = :key',
    ExpressionAttributeValues: {
      ':key': key
    }
  }

  return ddb.query(params).promise()
    .then((data) => {
      return data.Count > 0 ? data.Items[data.Count - 1] : null
    })
}

/**
 * Capture SESSION_ID from cookie and URI. Query DynamoDB table (“requests”)
 * for record with primary key value of “SESSION_ID+URI”:
 * 
 * If record exists:
 *   Compare timestamp — if difference is greater than X minutes (set threshold as desired):
 *     Remove record from table
 *     Unset cookie SESSION_OVER_LIMIT (remove cookie or set to false)
 * Else:
 *   Increment count field
 *   If count > threshold (set as desired):
 *     Set cookie SESSION_OVER_LIMIT in response with expiration of X minutes
 *     Reject / redirect request
 *
 * If record does NOT exist:
 *   Create new record, including timestamp and count of 1
 * 
 * @param  event
 * @param  context
 * @param  callback
 */
exports.handler = (event, context, callback) => {
  // console.log(util.inspect(event, { depth: 5 }))

  let request = event.Records[0].cf.request
  const key = clientKeyFor(request)

  // if there is no session id, just return request and move on...
  if (!key) {
    callback(null, request)
  }
  
  getLastRecordFor(key)
    .then((record) => {
      if (record) {
        console.log(`** ${util.inspect(record, { depth: 5 })} **`)
        return examineRecord(key, record)  
      } else {
        return createRecordFor(key, request)
      }
    })
    .then(() => callback(null, request))
    .catch((error) => {
      if (error instanceof OverLimitError) {
        callback(null, rateLimit())
      } else {
        callback(error)
      }
    })
}
