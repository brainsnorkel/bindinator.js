/* global require, __dirname */
'use strict'

const http = require('http')
const https = require('https')
const fs = require('fs')
const url = require('url')

const settings = {
  socket: 8017,
  web_root: __dirname,
  https: false,
  cert_path: 'localhost-ssl/public.pem',
  key_path: 'localhost-ssl/private.pem'
}

process.argv.slice(2).forEach(arg => {
  const parts = arg.split(':').map(s => s.trim())
  if (parts[0]) {
    settings[parts[0]] = parts.length === 2 ? parts[1] : true
  }
})

console.log(settings)

const options = settings.https
  ? {
    key: fs.readFileSync(settings.key_path),
    cert: fs.readFileSync(settings.cert_path)
  }
  : {}

const handlerMap = [] // { handler },
// handler is a function;
// handler.test is an endpoint test,
// handler.methods is array of methods

const on = (methods, endpoint, handler) => {
  handler.methods = Array.isArray(methods) ? methods : [methods]

  if (typeof endpoint === 'function') {
    handler.test = endpoint
  } else if (endpoint instanceof RegExp) {
    handler.test = path => endpoint.test(path)
  } else if (typeof endpoint === 'string') {
    handler.test = path => path === endpoint
  } else {
    throw new Error('expect endpoint to be a string, RegExp, or test function')
  }

  handlerMap.push(handler)
}

const mimeTypes = {
  svg: 'image/svg+xml',
  css: 'text/css',
  jpg: 'image/jpeg',
  png: 'image/png',
  json: 'application/json',
  js: 'text/javascript'
}

const handleStaticRequest = (req, res) => {
  const urlObj = url.parse(req.url)
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Headers', req.headers.origin)
  }
  fs.readFile(settings.web_root + urlObj.pathname, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end('not found')
    } else {
      const fileExtension = urlObj.pathname.split('.').pop()
      const mimeType = mimeTypes[fileExtension]
      if (mimeType) {
        res.setHeader('content-type', mimeType)
      }
      res.writeHead(200)
      res.end(data)
    }
  })
}

on('GET', '/api', (req, res) => {
  res.writeHead(200)
  res.end('hello api\n')
})

on('GET', /\/api\/files\/.*/, (req, res) => {
  res.writeHead(200)
  res.end('hello files\n')
})

// TODO
// Pass urlObj rather than generate it twice
// Allow request handlers to see the server and subdomain
const requestHandler = (req, res) => {
  const urlObj = url.parse(req.url)
  // console.log(req.method, urlObj.pathname, urlObj.query);
  const handler = handlerMap.find(
    handler => handler.test(urlObj.pathname) && handler.methods.indexOf(req.method) !== -1
  ) || handleStaticRequest
  handler(req, res)
}

if (settings.https) {
  https.createServer(options, requestHandler).listen(settings.socket)
} else {
  http.createServer({}, requestHandler).listen(settings.socket)
}
