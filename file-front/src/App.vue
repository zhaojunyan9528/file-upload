<template>
  <div id="app">
    <form method="post" enctype="multipart/form-data" class="uploadForm">
      <div>
        <label for="file">选择要上传的文件</label>
        <input type="file" id="file" name="file" @change="handleFileChange"/>
      </div>
      <div class="info">
        <div>文件：{{ fileObj.name }}</div>
        <div>大小：{{ getFileSize(fileObj.size) || 0 }} M</div>
        <div>类型：{{ fileObj.type }}</div>
        <div>上传状态： {{ uploadStatus }}---进度：{{ currentProgress }}</div>
        <div>
          <div>上传文件地址：</div>
          <div v-for="url in fileUrls" :key="url"><a :href="url" target="_blank" download="" @click="handleDownload(url)">{{ url }}</a></div>
        </div>
        <div>
          是否限制并发请求数量：
          <label for="limit1">
            <input type="radio" id="limit1" name="limit" value="0" :checked="isLimit === '0'" @change="handleRadio"/>不限制
          </label>
          <label for="limit2">
            <input type="radio" id="limit2" name="limit" value="1" :checked="isLimit === '1'" @change="handleRadio"/>限制
          </label>
        </div>
      </div>
      
      <div>
        <button @click="handleUpload">上传</button>&nbsp;&nbsp;&nbsp;&nbsp;
        <button @click="handleUploadChunk">切片上传</button>
      </div>
    </form>

  </div>
</template>

<script>
import axios from 'axios'
import { nanoid } from 'nanoid'
export default {
  name: 'App',
  data() {
    return {
      fileObj: {},
      uploadStatus: 'wait upload',
      fileUrls: [
        '/public/uploadFiles/vue.js-1683702117323.pdf'
      ],
      uploadProgress: 0, // 已上传文件
      totalProgress: 0,
      isLimit: '1', // 0不限制 1限制并发请求数量
      folderName: '' // 当前上传文件要存储的临时目录
    }
  },
  computed: {
    currentProgress() {
      return this.totalProgress ? (this.uploadProgress / this.totalProgress * 100).toFixed(2) + '%' : '0%'
    }
  },
  methods: {
    handleRadio(e) {
      this.isLimit = e.target.value
    },
    // 获取文件大小
    getFileSize(size) {
      return size ? (size / 1024 / 1024).toFixed(2) : 0 // M
    },
    handleFileChange() {
      const inputFileEle = document.getElementById('file')
      const file = inputFileEle.files[0] || {}
      this.fileObj = file
      console.log(file)
      this.uploadProgress = 0
      this.totalProgress = 0
      this.uploadStatus = 'wait upload'
    },
    // 文件切片
    handleFileChunk(file, size = 1024 * 1024 * 5) {
      let current = 0
      const res = []
      while(current < file.size) {
        res.push(file.slice(current, current + size))
        current+= size
      }
      return res
    },
    // 获取切片文件，组装切片请求
    handleChunkAxios() {
      const file = this.fileObj
      // 获取切片文件
      const fileChunkList = this.handleFileChunk(file)

      this.totalProgress = fileChunkList.length + 1
      console.log(fileChunkList)
      this.uploadProgress = 0
      this.folderName = nanoid()
      const uploadAxiosList = fileChunkList.map((item, index) => {
        let formData = new FormData()
        let uuid = nanoid()
        formData.append('chunkFile', item, uuid + '@@' + index)
        formData.append('folderName', this.folderName)
        formData.append('filename', uuid + '@@' + index)
        // 限制并发请求
        if (this.isLimit === '1') {
          return {
            url: '/api/fileupload/chunk',
            data: formData
          }
        } else {
          return axios.post('/api/fileupload/chunk', formData).then(res => {
            this.uploadProgress++
            console.log(this.uploadProgress, res.data)
          })
        }
      })
      return uploadAxiosList
    },
    // 文件切片上传完成发起合并
    handleFileEnd() {
      const file = this.fileObj
      axios.post('/api/fileupload/chunk_end', {
        filename: file.name.split('.').slice(0, -1).join('.'),
        extname: file.name.split('.').slice(-1)[0],
        folderName: this.folderName
      }).then(res => {
        console.log(res)
        this.uploadProgress++
        this.uploadStatus = res.data.message
        this.fileUrls.push(res.data.data.fileUrl)
      }).catch(() => {
        this.uploadStatus = 'fail'
      })
    },
    // 切片上传
    handleUploadChunk(event) {
      event.preventDefault()
      // 获取切片请求列表
      const uploadAxiosList = this.handleChunkAxios()
      if (this.isLimit === '1') {
        // 限制并发请求数量，切片上传结束后发起合并
        this.limitWidthRequests(uploadAxiosList, 6, (res) => {
          console.log(res)
          this.handleFileEnd()
        })
      } else {
        this.uploadStatus = 'loading'
        // 如果全部请求成功就发送合并请求
        Promise.all(uploadAxiosList).then((res) => {
          console.log('切片上传结束---', res)
          this.handleFileEnd()
        })
      }
    },
    // 限制并非请求数量
    limitWidthRequests(requestList = [], max = 6, callback) {
      const limitNum = Math.min(requestList.length, max)
      let count = 0
      const run = () => {
        count++
        const api = requestList.shift()
        this.uploadStatus = 'loading'
        axios.post(api.url, api.data).then(res => {
          count--
          this.uploadProgress++
          console.log(this.uploadProgress, res.data, count)
          // 发起下一个切片上传
          if (requestList.length && count < limitNum) {
            console.log('then-run', count)
            run()
          }
          if (!requestList.length && !count) {
            callback('切片全部上传')
          }
        })
      }
      for (let index = 0; index < limitNum; index++) {
        console.log('index-run', index)
        run()
      }
    },
    // 整个文件上传
    handleUpload(event) {
      event.preventDefault()
      let formData = new FormData()
      formData.append('file', this.fileObj)
      this.uploadStatus = 'loading'
      axios.post(
        '/api/fileupload',
        formData
      ).then(res => {
        this.uploadStatus = res.data.message
        this.fileUrls.push(res.data.data.fileUrl)
        console.log('handleUpload---', res)
      }).catch(err => {
        console.log('handleUpload---err', err)
        this.uploadStatus = 'fail'
      })
    },
    // 下载
    handleDownload(fileUrl) {
      axios.get(fileUrl).then(res => {
        console.log(res)
        let a = document.createElement("a")
        a.href = window.URL.createObjectURL(res.blob())
        // a.download = fileName;
        a.style.display = "none"
        document.body.appendChild(a)
        a.click()
        URL.revokeObjectURL(a.href) // 释放URL 对象
        a.remove()
      })
    }
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
.uploadForm {
  border: 1px solid #ccc;
  width: 600px;
  border-radius: 10px;
  padding: 20px;
  text-align: left;
}
.info {
  padding: 20px 0 40px;
  line-height: 1.8;
}
</style>
