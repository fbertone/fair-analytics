const micro = require('micro')
const url = require('url')
const cors = require('micro-cors')({ allowMethods: ['POST'] })
const denodeify = require('denodeify')
const renderIndex = require('./render-index')
const route = require('./route')

const { json, send } = micro

const createServer = (feed, broadcast, sse, statsDb, origin = '*') => {
  const append = denodeify(feed.append.bind(feed))

  async function storeLog (rawData) {
    const data = Object.assign(rawData, {
      time: Date.now()
    })
    return append(data).then(() => broadcast.setState(data))
  }

  return micro(
    route({
      '/': {
        GET: async (req, res) => {
          send(res, 200, renderIndex(feed.key.toString('hex')))
        },
        POST: cors(async (req, res) => {
          if (origin !== '*') {
            if (!req.headers.origin) return send(res, 403, 'Not Allowed')
            const { host, hostname } = url.parse(req.headers.origin)
            if (host !== origin || hostname !== origin) { return send(res, 403, 'Not Allowed') }
          }
          const body = await json(req)
          if (!body.event) throw micro.createError(400, '"event" is required')
          if (!body.pathname) body.pathname = 'NO_PATHNAME'
          await storeLog(body)
          send(res, 204, null)
        })
      },
      '/_live': {
        GET: async (req, res) => {
          sse.addClient(req, res)
        }
      },
      '/_stats': {
        GET: async (req, res) => {
          send(res, 200, statsDb.getAllEvents())
        }
      },
      '/favicon.ico': {
        GET: async function (req, res) {
          send(res, 204, null)
        }
      }
    })
  )
}

module.exports = createServer
