(function main() {
  const express = require('express');
  const app = express();
  const http = require('http');
  const tcp_server = http.createServer(app);
  const { Server } = require("socket.io");
  const io = new Server(tcp_server);

  
  
  // a public directory that i can store imgages, stylesheets, scripts, etc. 
  // https://stackoverflow.com/questions/41991349/express-node-js-cant-get-image-to-load
  app.use(express.static('public'));
 
  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/emcb_test.html');
  });
  
  io.on('connection', (socket) => {
    console.log('a user connected');
    
    socket.on('disconnect', () => {
      console.log('user disconnected');
    });
    
  });
  
  // TCP Server
  tcp_server.listen(8085, () => {
    console.log('TCP server is listening at port 8085');
  });
})();