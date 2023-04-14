// ONLY RUN THIS SCRIPT ONCE TO CREATE AN ORGANIZATION. 
// YOU CAN ONLY CREATE 10 ORGANIZATIONS PER APPLICATION.
// **THERE IS NO WAY TO EDIT OR REMOVE** AN ORGANIZATION FROM AN APPLICATION 
// ONCE ADDED, ASIDE FROM CREATING A NEW, BLANK APPLICATION.

// RUN AFTER YOU'VE CREATED AN APPLICATION AT https://portal.em.eaton.com.
// IMMEDIATELY AFTER CREATING THE APPLICATION (BEFORE EXITING OUT OF THE
// SCREEN), RECORD THE "API SUBSCRIPTION KEY", "CLIENT ID", "CLIENT SECRET 1", 
// AND "CLIENT SECRET 2". SAVE THESE VALUES IN THEIR RESPECTIVE CONSTANTS BELOW 
// (API_SUB_KEY, CLIENT_ID, CLIENT_SECRET, AND CLIENT_SECRET2, RESPECTIVELY).

(function main() {
  
  // const express = require('express');
  // const app = express();
  // const http = require('http');
  // const server = http.createServer(app);
  // const { Server } = require("socket.io");
  // const io = new Server(server);
  // const axios = require('axios');      // Axios is used to send requests to the server to work with the Eaton EMCB API
  // const fileSystem = require("fs");    // used for saving org data to org[x].JSON file
  const emcb = require("./emcb_lib.js"); // custom module wit common functions used when interacting with Eaton EMCB API
  const fileSystem = require("fs");    // used for saving data to files
  
  // File name containing app API info
  const app_file = "AnotherToot(2).json"
  
  // Info for organization to add
  var address_info = {
      "name": "PSEC Warrendale",
      "description": "Eaton Power Systems Experience Center (Warrendale)",
      "locationType": "address",
      "contact": "Dan Carnovale",
      "email": "DanielJCarnovale@Eaton.com",
      "phone": "+1 412 716 6938",
      "address": {
        "city": "Warrendale",
        "state": "Pennsylvania",
        "postalCode": "15086",
        "street1": "130 Commonwealth Drive"
      }
  };
  // emcb.createOrg(API_SUB_KEY,CLIENT_ID,CLIENT_SECRET, address_info);
  var app_filename = "AnotherToot(2).json";
  var app_info = emcb.readJSON(app_filename);
  emcb.getOrgs(app_info).then((response) => {
        var filename = 'organizations.json';
        var output_str = JSON.stringify(response,null,'\t');
        console.log('saving organization info to ' + filename + '...');
        fileSystem.writeFile(filename, output_str, (error) => {
          if (error) throw error;
        });
  });
})();