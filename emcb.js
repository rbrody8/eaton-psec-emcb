(function main() {
  const express = require('express');
  const app = express();
  const http = require('http');
  const tcp_server = http.createServer(app);
  const { Server } = require("socket.io");
  const io = new Server(tcp_server);
  const emcb = require("./emcb_lib.js");
  const fileSystem = require("fs");    // used for saving data to files
  const udp = require('dgram');
  const udp_socket = udp.createSocket('udp4');
  const poll_imediately = false;
  
  const UDP_PORT = emcb.getUDPport(); // must be 32866 for EMCBs (spells "EATON" on keypad); hardcoded in EMCB firmware 
  const UDP_BROADCAST_IP = emcb.getBroadcastAddress(); // use ifconfig in beablebone terminal to find the broadcast IP address
  
  
  // a public directory that i can store imgages, stylesheets, scripts, etc. 
  // https://stackoverflow.com/questions/41991349/express-node-js-cant-get-image-to-load
  app.use(express.static('public'));
      
  // var app_filename = "AnotherToot(2).json";
  var app_filename = "Eaton_PSEC_EMCBs.json";
  var app_info = emcb.readJSON(app_filename);
  // var org_filename = "org8.json";
  var org_filename = "org_PSEC.json";
  var org_info = emcb.readJSON(org_filename);
  
  
    // io.on('read meter', (deviceInd) => {
  //   var deviceID = devices[deviceInd].id;
  //   console.log('reading meter for breaker ' + deviceID);
  //   emcb.readMeter(app_info,org_info,deviceID);
  // });

  // body-parser is used to handle post requests, if you want to use post requests:
  // https://stackoverflow.com/questions/55558402/what-is-the-meaning-of-bodyparser-urlencoded-extended-true-and-bodypar
  // const bodyParser = require('body-parser');
  // app.use(bodyParser.urlencoded({ extended: false }));
  // app.use(bodyParser.json);
  // app.post('/', (req, res) => {
  //   res.sendFile(__dirname + '/emcb.html');
  // });
  
  async function resolveAfter5Sec() {
    var seconds = 5;
    var ms_per_s = 1000;
    var miliseconds = seconds*ms_per_s;
    return emcb.asyncWait(miliseconds);
    // return new Promise(resolve => {
    //   setTimeout(() => {
    //     resolve('resolved');
    //   }, 5000);
    // });
  }
  
  function pollAgainAfter5Sec(device_info,socket) {
    console.log('waiting...');
    resolveAfter5Sec().then(() => {
      pollBreaker(device_info,socket);
    });
  }
  
  function pollBreaker(device_info,socket) {
    console.log("polling device " + device_info.id);
    emcb.getWaveforms(app_info,org_info,device_info.id).then((response) => {

      var V0 = 0;
      var I0 = 0;
      var P0 = 0;
      var V1 = 0;
      var I1 = 0;
      var P1 = 0;
      var numSamples = response.data.mVp0.length;
      for (let i=0; i<numSamples; i=i+1) {
        V0 = V0 + Math.pow(response.data.mVp0[i]/1000, 2);
        I0 = I0 + Math.pow(response.data.mAp0[i]/1000, 2);
        P0 = P0 + (response.data.mVp0[i]/1000)*(response.data.mAp0[i]/1000);
        
        V1 = V1 + Math.pow(response.data.mVp1[i]/1000, 2);
        I1 = I1 + Math.pow(response.data.mAp1[i]/1000, 2);
        P1 = P1 + (response.data.mVp1[i]/1000)*(response.data.mAp1[i]/1000);
      }
      V0 = Math.sqrt(V0/numSamples);
      I0 = Math.sqrt(I0/numSamples);
      P0 = P0/numSamples;
      V1 = Math.sqrt(V1/numSamples);
      I1 = Math.sqrt(I1/numSamples);
      P1 = P1/numSamples;
      
      console.log("V0 = " + V0 + ", I0 = " + I0 + ", P0 = " + P0);
      socket.emit('got meter data',device_info,V0,I0,P0,V1,I1,P1);
      pollAgainAfter5Sec(device_info,socket);
    });
  }
  
  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/emcb.html');
  });
  
  io.on('connection', (socket) => {
    console.log('a user connected');
    
    socket.on('disconnect', () => {
      console.log('user disconnected');
    });
    
    socket.on('open breaker', (deviceID,reason) => {
        emcb.openBreaker(app_info,org_info,deviceID,reason).then(() => {
          socket.emit('breaker opened');
        }).catch((error) => {
          if (error.response.data.error.message !== "Too Many Requests"){
            throw(error);
          } else {
            socket.emit('retry open', deviceID,reason);
          }
        });
    });
    
    socket.on('close breaker', (deviceID,reason) => {
        emcb.closeBreaker(app_info,org_info,deviceID,reason).then(() => {
          socket.emit('breaker closed');
        }).catch((error) => {
          if (error.response.data.error.message !== "Too Many Requests"){
            throw(error);
          } else {
            socket.emit('retry close', deviceID,reason);
          }
        });
    });
    
    socket.on('update device list', (deviceList) => {
      console.log("updating device list");
      emcb.getDevices(app_info,org_info).then((newDeviceList) => {
        if (!emcb.isEqualObjects(deviceList, newDeviceList)) {
          socket.emit('new device list', newDeviceList);
        } else {
          socket.emit('no new device list');
        }
      });
    });
    
    socket.on('get handle pos', (deviceID) => {
      console.log('getting hanlde position');
      emcb.getRemoteHandlePos(app_info,org_info,deviceID)
      .then((open_or_closed) => {
        if (open_or_closed === 'open'){
          socket.emit('handle open', deviceID);
        } else {
          socket.emit('handle closed', deviceID);
        }
      });
    });
    
    socket.on('get waveforms', (deviceID) => {
      console.log('getting waveforms for breaker ' + deviceID);
      emcb.getWaveforms(app_info,org_info,deviceID).then(() => {
        socket.emit('got waveforms');
      });
    });
    
    // start polling breakers
    if (poll_imediately) {
      emcb.getDevices(app_info,org_info).then((device_list) => {
        // for (let i=0; i<device_list.length; i=i+1){
        //   var device = device_list[i];
        //   pollBreaker(device, socket);
        // }
        pollBreaker(device_list[0], socket);
      });
    }
    
  });
  
  // TCP Server
  tcp_server.listen(8085, () => {
    console.log('TCP server is listening at port 8085');
  });
  
  // UDP Server
  udp_socket.on("message", (msg, rinfo) => {
    console.log("server got: " + msg + " from " + rinfo.address + ":" + rinfo.port);
  });
  
  udp_socket.on('listening', function(){
    var address = udp_socket.address();
    var port = address.port;
    console.log('UDP server is listening at port ' + port);
  });
  udp_socket.bind(UDP_PORT); // i think you have to use port 32866: https://api.em.eaton.com/docs/emlcp.html#section/Smart-Breaker-Local-Communications-Protocol/Protocol-Overview
  // emcb.pollAllUDP(udp_socket);
  emcb.deleteAllUDPKeys(app_info,org_info).then(() => {
    emcb.monitorUDPKeys(app_info,org_info);
  });
  // udp_server.send(response)
  
  
  

})();