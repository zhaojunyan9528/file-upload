const express = require('express')
const http = require('http')
// const axios = require('axios')
const bodyParser = require('body-parser')
const fs = require('fs')
const multer = require('multer')
const path = require('path')
// const upload = multer({ dest: 'uploadFiles/'})

// 创建web服务器
const app = express()


const upload = (storageDir = './public/uploadFiles/', storage = true, originName = false) => multer({
  // 处理文件名乱吗
  fileFilter: function(req, file, cb) {
    console.log('fileFilter--', file)
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf-8')
    cb(null, true)
  },
  storage: storage ? multer.diskStorage({
    destination: function(request, file, cb) {
      console.log('storage--', file)
      cb(null, storageDir)
    },
    filename: function(req, file, cb) {
      let fileData = !originName ?
        decodeURI(path.basename(file.originalname, path.extname(file.originalname))) + '-' + (+new Date()) + path.extname(file.originalname)
        : decodeURI(file.originalname)
      cb(null, fileData)
    }
  }) : null
})


app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.use((request, response, next) => {
  console.log('request server....from: ', request.get('Host'))
  next()
})

app.get('/', (req, res) => {
  res.send('http://localhost:5000')
})
// 访问文件
app.get('/public/uploadFiles/*', (req, res) => {
  console.log(req.url)
  res.sendFile(path.join(__dirname, req.url))
})
// 文件上传--整个
app.post('/fileupload', upload().single('file'), (request, response) => {
  console.log('/fileupload------:', request.file)
  response.send({
    message: 'success',
    data: {
      fileUrl: '/' + request.file.path
    }
  })
})
// 切片上传
app.post('/fileupload/chunk', upload('./public/uploadFiles/chunk', false, true).single('chunkFile'), (request, response) => {
  console.log('/fileupload/chunk------:', request.file)
  console.log('/fileupload/chunk--body------:', request.body)
  try {
    const file = request.file
    const params = request.body

    // folderName：当前上传文件要存储的临时目录 若不存在则创建
    const isExist = fs.existsSync('./public/uploadFiles/chunk/' + params.folderName)
    console.log('是否存在目录', isExist)
    if (!isExist) {
      fs.mkdirSync(path.join(__dirname, './public/uploadFiles/chunk/' + params.folderName))
    }

    const filePath = path.join(__dirname, './public/uploadFiles/chunk/' + params.folderName + '/' + params.filename)
    console.log(filePath)
    fs.writeFileSync(filePath, file.buffer)

    response.send({
      message: 'success',
      data: {
        fileUrl: filePath,
        filePath: file.path
      }
    })
  } catch (error) {
    response.send({
      message: 'fail: ' + error
    })
  }
})
// 切片上传-整合
app.post('/fileupload/chunk_end', (request, response) => {
  console.log('/fileupload/chunk_end------:', request.body)
  const { filename, extname, folderName } = request.body
  let targetFile = filename + '-' + (+new Date())+ '.' + extname
  // 合并文件
  chunkStreamMerge(
    './public/uploadFiles/chunk/' + folderName,
    './public/uploadFiles/' + targetFile
  )
  // fs.rmdirSync(sourceFile)
  response.send({
    message: 'success',
    data: {
      fileUrl: '/public/uploadFiles/' + targetFile
    }
  })
})

/**
 * 
 * @param {string } sourceFile  存放所有切片文件的目录
 * @param {string} targetFiles  合并之后的文件路径
 * @param {string} folderName  取对应目录的文件切片
 */
function chunkStreamMerge(sourceFile, targetFiles) {
  const list = fs.readdirSync(path.resolve(__dirname, sourceFile))
  // 获取文件切片后排序
  const sortList = list.sort(function(a, b) {
    const pre = a.split('@@').slice(-1)
    const current = b.split('@@').slice(-1)
    return pre - current
  })
  console.log('chunkList', sortList)
  const fileWriteStream = fs.createWriteStream(path.resolve(__dirname, targetFiles))
  const isExist = fs.existsSync(path.resolve(__dirname, targetFiles))
  console.log('end文件是否存在', isExist)
  chunkStreamMergeProgress(sortList, fileWriteStream, sourceFile)
}
/**
 * 合并每一个切片文件
 * @param {Arary} fileList 文件切片数据
 * @param {*} fileWriteStream 最终写入的结果
 * @param {*} sourceFile 文件路径
 */
function chunkStreamMergeProgress(fileList = [], fileWriteStream, sourceFile) {
  if (!fileList.length) {
    // 写入结束删除临时目录
    fs.rmdirSync(sourceFile)
    return fileWriteStream.end()
  }

  const currentFile = path.resolve(__dirname, sourceFile, fileList.shift())

  console.log('currentFile:', currentFile)
  const currentReadStream = fs.createReadStream(currentFile)

  // currentReadStream.on('data', (data) => {
  //   console.log('data:', data)
  // })
  currentReadStream.on('error', (err) => {
    console.log('文件读取error:', err)
  })
  currentReadStream.pipe(fileWriteStream, { end: false})

  // 合并后删除切片
  fs.rm(currentFile, { recursive: true}, err => {
    if (err) {
      console.error('rm-----', err.message)
      return
    }
  })
  // 当前文件切片读取结束后循环下一切片
  currentReadStream.on("end", () => {
    console.log('文件读取end')
    chunkStreamMergeProgress(fileList, fileWriteStream, sourceFile)
  })
}

// 监听端口5000，并开启web服务器
app.listen(5000, (err) => {
  if (!err) console.log(' server is running at: http://localhost:5000')
  app.send
})