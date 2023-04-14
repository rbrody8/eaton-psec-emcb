// Documentation Last Updated: 3/7/2023, Ryan Brody

// This module implements the the Eaton Energy Management Circuit Breaker (EMCB)
// application program interface (API) in JavaScript.

// If you don't know what an API is, the link below provides an explanatoin. The
// Eaton EMCB API is a RESTful API.
//    https://www.geeksforgeeks.org/what-is-an-api/

// This library relies heavily on two objects that store important information
// needed to access the API (i.e. the keys, IDs, and secrets needed to obtain 
// authentication tokens and used frequently in the HTML request headers).
// This is done to avoid using classes in an effort to be easier to understand
// those with less coding experience.
// The variable names for these two objects are:
//    app_info  - stores application info from the "My Apps" page of the  
//                EMCB developers' portal (https://portal.em.eaton.com/applications)
//    org_info  - stores info for the organizations that have been created
//                within each application
// These variables are Objects. The possible keys are listed below, but they may
// not always be present depending on the situation. For example, app_info.auth
// and org_info.auth will not be present until after obtaining authentication
// tokens uusing getAPIAuthToken() or getOrgAuthToken(), respecitvely. 
//    app_info
//      .api_key            - 
//      .client_id          - 
//      .secrets            - the clients secrets, stored this way to be the same as the organizaiton secretes
//      .auth

//    org_info
//      .id
//      .name
//      .description
//      .serviceAccount
//          .clientId
//          .secretes
//      .addresses          - An array of addresss locaitos in the orgnization.
//      .panels             - an array of panel locations in the organization.
//      .file_name
//      .auth

// Secrets are stored in the following format because this is how the Eaton EMCB
// returns the organization secrets after creating them:
//    secrets = [
// 	    {
//     		"name": "secret1",
//     		"value": "secret_value_string",
//     		"expiry": "secret_expire_ISO8601"
//     	},
//     	{
//     		"name": "secret2",
//     		"value": "secret_value_string",
//     		"expiry": "secret_expire_ISO8601"
//     	}
//    ]

// Authentication token (i.e. ".auth") information is stored in an Object with
// the following fields:
//    .auth
//        .token
//        .expiresAt

// Addresses and electrical panels are both treated as "locations" by the EATON 
// EMCB API, but this implementation treats them separately for clarity because 
// each location type has different keys stored in the object. Keys for both 
// locaiton types are:
//    .addresses = [address_1, address_2, ..., address_i, ..., address_n]
//    address_k
//        .id
//        .name
//        .description
//        .organizationId
//        .contact
//        .email
//        .phone
//        .locationType     - will always be "address" for the addresses
//        .address
//            .city
//            .state
//            .postalCode
//            .street1
//    .panels = [panel_1, panel_2, ..., panel_j, ..., panel_m]
//    panel_m
//        .id
//        .name
//        .parentLocationId - this must be equal to address_k.id for some k
//        .organizationId   - this must be equal to org_info.id
//        .locationTye      - will always be "equipment" for electrical panels

// Because this module involves working with web servers, many of the functions
// are asynchronous (deonted by the async keyword in front of the fucntion 
// definition). As a result, they can't be used in the same way synchronous
// functions are used. Synchronous functions will be executed line-by-line
// and will execute in the order they appear in the code (i.e. lines at the top
// execute first, the lines at the bottom execute last). With asynchronous
// functions, functions in one line will start executing before the function
// in the previous line finishes executing. Therefore, to make sure information
// from an asynchronous funciton before another function is called, you 
// need to use the then() rather than calling functions line by line. The then() 
// function has the following syntax:
//    function1.then(function2, error_function)
// The way to think about this line of code is, "function1 executes, *then* 
// function2 executes". Here, whatever is returned by function1 is passed as
// input to funciton2. If there is an error in function1, error_funciton
// executes instead of function2. Both function2 and error_funciton can be 
// omited as follows:
//    var function1_promise = function1.then()
// In this case, funciton1_promise stores whatever value function1 returns if
// function1 is done executing. If it's not done executing, function1_promise
// is a Promise object, not a value. Promises are used by asynchronous functions
// to keep track of when infomraiton returned by an asynchronous function is
// ready to be used, in which case the promise is said to be "fullfilled". For
// more information on promises, see the following website:
//    https://www.w3schools.com/Js/js_promise.asp
//    https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise

// Other JS modules that this library depends on:
const axios = require('axios');      // used to handle HTML requests 
                                     // (i.e. access the EATON EMCB API)
                                     
const fileSystem = require("fs");    // used for saving data to files
const process = require("process");  // used to get current working directory
// const plotly = require("plotly.js-dist"); // used for plotting (but it's not working)

async function getAuthToken(api_key, client_ID, client_secret) {
  var request = {
    "method": "POST",
    "url": "https://api.em.eaton.com/api/v1/serviceAccount/authToken",
    "headers": {
      "Em-Api-Subscription-Key": api_key,
      "Accept": "application/json",
      "Content-Type": "application/json; charset=utf-8"
    }
  };
  var payload = {
    "clientId": client_ID,
    "clientSecret": client_secret
  };
  request.data = payload;
  var response_promise = axios(request).then((response) => {
    return response.data.data;
    //  {
    //    'token': auth_token_str
    //    'expiresAt': expiration_str_ISO_8601
    //  }
  });
  
  return response_promise;
}

async function getAPIAuthToken(app_info) {
  var api_key = app_info.api_key;
  var clientId = app_info.client_id;
  var clientSecret = app_info.client_secret1;
  
  if (isAuthValid(app_info.auth)) {
    // current authentication token is still valid! no change needed!
    return;
  } else {
    // need new authentication token - use async function getAuthToken()
    var auth_response_promise = getAuthToken(api_key,clientId,clientSecret);
    var auth_info_promise = auth_response_promise.then((auth_info_obj) => {
      // store new authentication token in app_info after it's arrived
      app_info.auth = auth_info_obj;
      // no need to return anything because javascript objects pass by 
      // reference, updating app_info here also updates app_info in
      // whatever called this funtion. returning auth_info anyways just 
      // in case its ever needed
      return app_info;
    });
    // return a promise, and chain execute code after this function finishes by 
    // using .then() on the returned promise.
    return auth_info_promise;
  }
}

async function getOrgAuthToken(app_info, org_info) {
  // see getAPIAuthToken for documentation - this only has slight modifications
  var api_key = app_info.api_key;
  var clientId = org_info.serviceAccount.clientId;
  var clientSecret = org_info.serviceAccount.secrets[0].value;
  
  if (isAuthValid(org_info.auth)) {
    return;
  } else {
    var auth_response_promise = getAuthToken(api_key,clientId,clientSecret);
    var auth_info_promise = auth_response_promise.then((auth_info_obj) => {
      org_info.auth = auth_info_obj;
      return org_info;
    });
    return auth_info_promise;
  }
}

async function createOrg(app_filename, address_info) {
  // createOrg() requires the address variable to be an object with the
  // following fields:
  //    address = {
  //      "name": "Warrendale PSEC",
  //      "locationType": "address",
  //      "address": {
  //        "city": "Warrendale",
  //        "state": "Pennsylvania",
  //        "postalCode": "15086",
  //        "street1": "130 Commonwealth Drive"
  //      }
  //    };
  // STEP 0: GET AUTHENTICATION TOKEN
  var app_info = readJSON(app_filename);
  var auth_promise = getAPIAuthToken(app_info);
  
  // STEP 1: CREATE THE ORGANIZATION
  // (wait for getAPIAuthToken() to finish, ".then()" create org)
  var org_promise = auth_promise.then(() => {

    console.log("creating organization...");
    var create_org_request = {
      "method": "POST",
      "url": "https://api.em.eaton.com/api/v1/organizations",
      "headers": {
        "Em-Api-Subscription-Key": app_info.api_key,
        "Authorization": "Bearer " + app_info.auth.token,
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8"
      }
    };
    var payload = {
      "name": "Eaton PSEC",
      "description": "Eaton Power Systems Experience Center (Warrendale)"
    };
    create_org_request.data = payload;
    var org_info = axios(create_org_request).then((create_org_response) => {
      // store newly created organization's info in org_info object
      var new_org_info = create_org_response.data.data;
      new_org_info.addresses = [];
      new_org_info.panels = [];
      
      // saving oragnization information to a .JSON file (JSON = "Java Script Object Notation", just a text file that stores JS object fields/values)
      var i = 0;
      while (fileSystem.existsSync('org'+i+'.json')) {
        i = i+1;
      }
      var filename = process.cwd() + '/org'+i+'.json';
      console.log('organization created! saving important organization info to ' + filename + '...');
      console.log('WARNING - THIS INFORMATION CANNOT BE RECOVERED IF LOST');
      new_org_info.file_name = filename;
      var output_str = JSON.stringify(new_org_info,null,'\t');
      fileSystem.writeFileSync(filename, output_str, (error) => {
        if (error) throw error;
      });
      return new_org_info;
    });
    return org_info;
  }); // updates app_info, returns org_info object
  
  // STEP 2: ASSIGN ORGANIZATION ADDRESS
  var address_promise = org_promise.then((org_info) => {
    console.log("adding an address to organization...");
    return createAddress(app_info,org_info,address_info);
  }); // returns updated org_info with address
  
  // STEP 3: CREATE LOCATION FOR MAIN BREAKER BOX EQUIPMENT
  var main_panel_promise = address_promise.then((org_info) => {
    console.log("adding main panel box to the address...");
    var main_panel_info = {
      organizationId: org_info.id,
      name: "Main Breaker Box",
      parentLocationId: org_info.addresses[0].id, 
      locationType: "equipment"
    };
    return createPanel(app_info,org_info,main_panel_info);
  }); // returns updated org_info with main panel info
  
  // FINAL STEP: SAVE INFO AS .JSON FILE BECAUSE SOME OF YOU WOULD OTHERWISE 
  // NOT BE ABLE TO RECOVER AFTER THE SCRIPT HAS FINISHED EXECUTING.
  main_panel_promise.then((org_info) => {
    console.log('saving updated organization info with address and main panel box info in '+org_info.file_name+'...');
    console.log('adderss and main panel box info can be recovered later using the Eaton EMCB API if the information is lost.');
    var output_str = JSON.stringify(org_info,null,'\t');
    fileSystem.writeFileSync(org_info.file_name, output_str, (error) => {
      if (error) throw error;
    });
  });

}

async function createLocation(app_info, org_info, location_info) {
  // get organization's authentication token
  // console.log(org_info);
  var org_auth_promise = getOrgAuthToken(app_info, org_info);
  
  var location_added_promise = org_auth_promise.then(() => {
    // console.log(org_info);
    // create a location for EMCB's to exist in
    var location_request = {
      "method": "POST",
      "url": "https://api.em.eaton.com/api/v1/locations",
      "headers": {
        "Em-Api-Subscription-Key": app_info.api_key,
        "Authorization": "Bearer " + org_info.auth.token,
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8"
      }
    };
    var payload = location_info;
    payload.organizationId = org_info.id;
    location_request.data = payload;
    
    var location_response_prom = axios(location_request);
    var update_org_prom = location_response_prom.then((location_response) => {
      return location_response.data.data;
    });
    return update_org_prom;
  });
  
  return location_added_promise;
}

async function createAddress(app_info, org_info, address_info) {
  var location_promise = createLocation(app_info,org_info,address_info);
  var update_org_promise = location_promise.then((new_address_info) => {
    org_info.addresses.push(new_address_info);
    return org_info;
  });
  return update_org_promise;
}

async function createPanel(app_info, org_info, panel_info){
  var location_promise = createLocation(app_info,org_info,panel_info);
  var update_org_promise = location_promise.then((new_panel_info) => {
    org_info.panels.push(new_panel_info);
    return org_info;
  });
  return update_org_promise;
}

async function listOrgs(app_info) {
  getAPIAuthToken(app_info).then((app_info) => {
    var request = {
      "method": "GET",
      "url": "https://api.em.eaton.com/api/v1/organizations",
      "headers": {
        "Em-Api-Subscription-Key": app_info.api_key,
        "Authorization": "Bearer " + app_info.auth.token,
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8"
      }
    };
    var response_promise = axios(request);
    response_promise.then((response) => {
      console.log(response.data);
    });
  });
}

async function getQuotas(app_info) {
  var auth_promise = getAPIAuthToken(app_info);

  auth_promise.then((app_info) => {
    var request = {
      "method": "GET",
      "url": "https://api.em.eaton.com/api/v1/resourceQuotas",
      "headers": {
        "Em-Api-Subscription-Key": app_info.api_key,
        "Authorization": "Bearer " + app_info.auth.token,
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8"
      }
    };
    axios(request).then((quota_response) => {
      console.log(quota_response.data);  
    });
  });
  
}

async function getRoles(app_info, org_info) {
  var org_auth_promise = getOrgAuthToken(app_info, org_info);
  
  var roles_promise = org_auth_promise.then((org_info) => {
    var request = {
      "method": "GET",
      "url": "https://api.em.eaton.com/api/v1/roles",
      "headers": {
        "Em-Api-Subscription-Key": app_info.api_key,
        "Authorization": "Bearer " + org_info.auth.token,
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    };
    return axios(request).then((response) => {return (response.data.data);});
  });
  return roles_promise;
}

async function inviteInstaller(app_info, org_info, installer_info) {
  // locationId can be: 1) an organization ID to allow
  // the installer to add new addresses, add new equipment
  // locations, and commision new devices; 2) an address 
  // ID to allow the installer to add new equipment location
  // and commision new devices; or 3) an equipment ID to 
  // allow to only allow the installer to commission new devices.
  var org_auth_promise = getOrgAuthToken(app_info, org_info);
  var invite_promise = org_auth_promise.then((org_info) => {
    var folder = process.cwd();
    var installerFiles = filterJSON(folder,"installer");
    var numInstallers = installerFiles.length;
    var alreadyInvited = false;
    for (var i = 0; i < numInstallers; i = i+1){
      var installer_file_info = readJSON(installerFiles[i]);
      if (installer_file_info.email === installer_info.email) {
            alreadyInvited = true;
            break;
      }
    }
    if (alreadyInvited === true){
      // installer already invited - no need to invite again
      console.log(installer_info.email + " is already an installer!");
      return;
    } else {
      var request = {
        "method": "POST",
        "url": "https://api.em.eaton.com/api/v1/userRoles",
        "headers": {
          "Em-Api-Subscription-Key": app_info.api_key,
          "Authorization": "Bearer " + org_info.auth.token,
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      };
      request.data = installer_info;
      var response_promise = axios(request).then((response) => {
        installer_info = response.data.data;
        var j = 0;
        while (fileSystem.existsSync('installer'+j+'.json')) {
          j = j+1;
        }
        var filename = process.cwd() + '/installer'+j+'.json';
        installer_info.file_name = filename;
        var output_str = JSON.stringify(installer_info,null,'\t');
        console.log('saving important organization info to ' + filename + '...');
        fileSystem.writeFile(filename, output_str, (error) => {
          if (error) throw error;
        });
        return installer_info;
      });
      return response_promise;
    }
  });
  return invite_promise;
}

async function deleteInstaller(app_info, org_info, installer_info) {
  // WARNING - YOU MUST DELETE THE CORRESPONDING installer.json MANUALLY
  var org_auth_promise = getOrgAuthToken(app_info, org_info);
  org_auth_promise.then((org_info) => {
    var request = {
      "method": "DELETE",
      "url": "https://api.em.eaton.com/api/v1/userRoles",
      "headers": {
          "Em-Api-Subscription-Key": app_info.api_key,
          "Authorization": "Bearer " + org_info.auth.token,
          "Accept": "application/json",
          "Content-Type": "application/json"
      }
    };
    request.data = installer_info;
    
    axios(request).then((response) => {
      fileSystem.unlinkSync(installer_info.file_name);
      console.log("Installer removed, and " + installer_info.file_name + " has been deleted");
    });
  });
}

async function getInstallers(app_info, org_info, installer_info) {
  // WARNING - YOU MUST DELETE THE CORRESPONDING installer.json MANUALLY
  var org_auth_promise = getOrgAuthToken(app_info, org_info);
  org_auth_promise.then((org_info) => {
    var request = {
      "method": "GET",
      "url": "https://api.em.eaton.com/api/v1/userRoles",
      "headers": {
          "Em-Api-Subscription-Key": app_info.api_key,
          "Authorization": "Bearer " + org_info.auth.token,
          "Accept": "application/json",
          "Content-Type": "application/json"
      }
    };
    request.data = installer_info;
    
    axios(request).then((response) => {
      console.log(response.data.data);
    });
  });
}

async function getDevices(app_info, org_info, filter="") {
  var url_str = "https://api.em.eaton.com/api/v1/devices";
  if (filter !== "") { 
    url_str = `https://api.em.eaton.com/api/v1/devices?$filter=${filter}`;
    
  }
  var org_auth_promise = getOrgAuthToken(app_info, org_info);
  var request_promise = org_auth_promise.then((org_info) => {
    var request = {
      "method": "GET",
      "url": url_str,
      "headers": {
        "Em-Api-Subscription-Key": app_info.api_key,
        "Authorization": "Bearer " + org_info.auth.token,
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    };
    return axios(request).then((response) => { return response.data.data; });
  });
  return request_promise;
}

async function getDeviceBySN(app_info, org_info, SN_str) {
  var filter = `serialNumber eq '${SN_str}'`;
  return getDevices(app_info, org_info, filter);
}

async function getDevicesByLocID(app_info, org_info, loc_ID_str) {
  var filter = `locationId eq '${loc_ID_str}'`;
  return getDevices(app_info, org_info, filter);
}

async function getDevicesByParentLocID(app_info, org_info, parent_loc_ID_str) {
  var filter = `ancestorLocationId eq '${parent_loc_ID_str}'`;
  return getDevices(app_info, org_info, filter);
}

async function getRemoteHandlePos(app_info, org_info, deviceID) {
  var org_auth_promise = getOrgAuthToken(app_info,org_info);

  return org_auth_promise.then((org_info) => {
    var url_str = "https://api.em.eaton.com/api/v1/devices/" 
                  + deviceID + "/breaker/remoteHandle/position";
    var request = {
        "method": "GET",
        "url": url_str,
        "headers": {
            "Em-Api-Subscription-Key": app_info.api_key,
            "Authorization": "Bearer " + org_info.auth.token,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    };
    return axios(request).then((response) => {
        return response.data.data.position;
    });
  });
}

async function setBreaker(app_info, org_info, open_or_close, deviceID, reason) {
  var org_auth_promise = getOrgAuthToken(app_info,org_info);

  return org_auth_promise.then((org_info) => {
    var url_str = "https://api.em.eaton.com/api/v1/devices/" 
                  + deviceID + "/breaker/remoteHandle/position";
    var request = {
        "method": "POST",
        "url": url_str,
        "headers": {
            "Em-Api-Subscription-Key": app_info.api_key,
            "Authorization": "Bearer " + org_info.auth.token,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    };
    var payload = {
        "command": open_or_close,
        "reason": reason
    };
    request.data = payload;
    return axios(request).then((response) => {
        console.log("Breaker should now be " + open_or_close + "...");
    });
  });
}

async function openBreaker(app_info, org_info, deviceID, reason) {
  return setBreaker(app_info, org_info, "open", deviceID, reason);
}

async function closeBreaker(app_info, org_info, deviceID, reason) {
  return setBreaker(app_info, org_info, "close", deviceID, reason);
}

async function getWaveforms(app_info, org_info, deviceID) {
  var org_auth_promise = getOrgAuthToken(app_info,org_info);
  var request_promise = org_auth_promise.then((org_info) => {
    var url_str = "https://api.em.eaton.com/api/v1/devices/" 
                  + deviceID + "/waveforms";
    var request = {
        "method": "POST",
        "url": url_str,
        "headers": {
            "Em-Api-Subscription-Key": app_info.api_key,
            "Authorization": "Bearer " + org_info.auth.token,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    };
    return axios(request).then(function(response){
      return response.data.data;
      // var xValues = Array.from({length: response.data.data.numSamples}, (e, i)=> i);
      // var yValues = response.data.data.mVp1;
      
      // // Define Data
      // var data = [{
      //   x: xValues,
      //   y: yValues,
      //   mode:"markers",
      //   type:"scatter"
      // }];
      
      // // Define Layout
      // var layout = {
      //   xaxis: {range: [40, 160], title: "Square Meters"},
      //   yaxis: {range: [5, 16], title: "Price in Millions"},
      //   title: "House Prices vs. Size"
      // };
      
      // plotly.newPlot("myPlot", data, layout);
    });
  });
  return request_promise;
}

async function readMeter(app_info, org_info, deviceID) {
  // I believe the meter info only updates about every 5 minutes
  var org_auth_promise = getOrgAuthToken(app_info,org_info);
  org_auth_promise.then((org_info) => {
    var url_str = "https://api.em.eaton.com/api/v1/devices/" 
                  + deviceID + "/data/telemetry/meter/latest";
    var request = {
        "method": "GET",
        "url": url_str,
        "headers": {
            "Em-Api-Subscription-Key": app_info.api_key,
            "Authorization": "Bearer " + org_info.auth.token,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    };
    return axios(request).then((response) => {return response.data.data;});
  });
  return org_auth_promise;
}

function readJSON(filename) {
  if (!(fileSystem.existsSync(filename))){
    throw(new Error('Error retreving stored app info: '
                        + filename + ' does not exist'));
  }
  
  try {
    var output = JSON.parse(fileSystem.readFileSync(filename));
    return output;
  }
  catch(err) {
    console.log(err.message);
    return null;
  }
}

function filterJSON(folder, filePrefix="") {
  var files = fileSystem.readdirSync(folder);
  var filteredFiles = files.filter((file) => {
    var minPossibleLen = filePrefix+"0.json".length;
    if (file.length < minPossibleLen) {
          return false;
    } else {
          var fileExt = file.substring(file.length-5, file.length);
          var installerStr = file.substring(0,"installer".length);
          return (fileExt === ".json") && 
                      (installerStr === "installer");
    }
  });
  return filteredFiles;
}

function isAuthValid(auth_info, safety_factor = 60*1e3) { 
  // this function checks if authorization token has expired yet.
  // auth_info object must have a field named 'expiresAt' in ISO 8601 format as
  // returned by the Eaton EMCB API, or else the function returns false. 
  // authorization tokens that expire in less than 'safety_factor' miliseconds
  // is considered invalid to account for latency. the default value for 
  // 'safety_factor' is equivalent to 1 minute'.

  // check for presence of authorization token info object
  var inputExists = (typeof auth_info !== 'undefined');
  if (inputExists !== true) {
    return false;
  }
  // check that auth_info has proper fieldnames
  var tokenExists = (typeof auth_info.token !== 'undefined');
  if (tokenExists) {
    return false;
  }
  var expirationExists = (typeof auth_info.expiresAt !== 'undefined');
  if (expirationExists) {
    return false;
  }

  // code for comparing ISO 8601 times is from:
  //    https://stackoverflow.com/questions/18023857/compare-2-iso-8601-timestamps-and-output-seconds-minutes-difference
  //    https://developer.mozilla.org/en-US/docs/web/javascript/reference/global_objects/date
  var time1_Date_obj = new Date(auth_info.expiresAt);
  var now_in_ms = Date.now();
  var time_diff_in_ms = time1_Date_obj-now_in_ms; // positive if time1_Date_obj 
                                                  // is in the future
  if (time_diff_in_ms > safety_factor) {
    console.log(auth_info);
    console.log("Still Valid!");
    return true;
  } else {
    return false;
  }
} 

function isEqualObjects(obj_a, obj_b) {
  // a recurve function that performs a deep comparison of objects
  // javascript strict equality "===" only checks if object pointers are
  // are equal, but we want something that checks if two objects have
  // all of the same keys and all of the same values sotred at each key.
  // this type of comparison is known as a "deep comparison" in computer
  // science, and is implemented here recursivly incase the input objects
  // contain nested objects within them.
  
  // code from the following website:
  // https://raphacmartin.medium.com/deep-equality-in-javascript-objects-1eea8abb3649
  
  // if the number of keys in each object is different, return false
  // without requiring recursive calls
  if (Object.keys(obj_a).length !== Object.keys(obj_b).length) {
    return false;
  }
  
  for (const key in obj_a) {
    const a_value = obj_a[key];
    const b_value = obj_b[key];
    
    // if the value is an object, check if they're different objects
    var a_is_object = a_value instanceof Object;
    var not_equal_objects = true;
    if (a_is_object) {
      not_equal_objects = !isEqualObjects(a_value, b_value);
    }
    var not_equal_values = a_value !== b_value;
    var condition1 = (a_is_object && not_equal_objects); // b must also be an object for equal_objects to return true
    var condition2 = (!a_is_object && not_equal_values); // b must also not be an object for equal_values to be true
    if (condition1 || condition2){
      return false;
    }
  }
  return true;
}

function isConnected(app_info,org_info,deviceID) {
  var org_auth_promise = getOrgAuthToken(app_info,org_info);

  return org_auth_promise.then((org_info) => {
    var url_str = "https://api.em.eaton.com/api/v1/devices/" 
                  + deviceID + "/device/metadata/isConnected";
    var request = {
        "method": "GET",
        "url": url_str,
        "headers": {
            "Em-Api-Subscription-Key": app_info.api_key,
            "Authorization": "Bearer " + org_info.auth.token,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    };
    return axios(request).then((response) => {
        return response.data.data.isConnected;
    });
  });
}

function getOrgs(app_info) {
  var api_auth_promise = getAPIAuthToken(app_info);

  return api_auth_promise.then((app_info) => {
    var request = {
        "method": "GET",
        "url": "https://api.em.eaton.com/api/v1/organizations",
        "headers": {
            "Em-Api-Subscription-Key": app_info.api_key,
            "Authorization": "Bearer " + app_info.auth.token,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    };
    return axios(request).then((response) => {
        return response.data.data;
    });
  });
}

// Including the function names in module.exports LIST below allows them to be 
// seen/used by other code that uses this library (or "module" in JavaScript).
// IF YOU ADD FUNCTIONS TO THIS LIBRARY, YOU MUST ADD THEM TO THE LIST BELOW.
// IF YOU RENAME A FUNCTION ALREADY IN THIS LIBRARY, YOU MUST MAKE SURE YOU
// RENAME EXACTLY THE SAME WHAY IN THE LIST BELOW.
module.exports = {getAuthToken, getOrgAuthToken, getAPIAuthToken, createOrg, 
  createLocation, createAddress, createPanel, listOrgs, getQuotas, readJSON,
  getDevices, getDeviceBySN, getDevicesByLocID, getDevicesByParentLocID, 
  setBreaker, openBreaker, closeBreaker, getWaveforms, readMeter, filterJSON, 
  isAuthValid, getRoles, inviteInstaller, deleteInstaller, getInstallers, 
  isEqualObjects, getRemoteHandlePos, isConnected, getOrgs
};