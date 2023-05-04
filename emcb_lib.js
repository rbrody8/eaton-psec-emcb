/*
Documentation Last Updated: 3/7/2023, Ryan Brody

This module implements the the Eaton Energy Management Circuit Breaker (EMCB)
application program interface (API) in JavaScript.

If you don't know what an API is, the link below provides an explanatoin. The
Eaton EMCB API is a RESTful API.
    https://www.geeksforgeeks.org/what-is-an-api/

This library relies heavily on two objects that store important information
needed to access the API (i.e. the keys, IDs, and secrets needed to obtain 
authentication tokens and used frequently in the HTML request headers).
This is done to avoid using classes in an effort to be easier to understand
those with less coding experience.
The variable names for these two objects are:
    app_info  - stores application info from the "My Apps" page of the  
                EMCB developers' portal (https://portal.em.eaton.com/applications)
    org_info  - stores info for the organizations that have been created
                within each application
These variables are Objects. The possible keys are listed below, but they may
not always be present depending on the situation. For example, app_info.auth
and org_info.auth will not be present until after obtaining authentication
tokens uusing getAPIAuthToken() or getOrgAuthToken(), respecitvely. 
    app_info
      .api_key            - 
      .client_id          - 
      .secrets            - the clients secrets, stored this way to be the same as the organizaiton secretes
      .auth

    org_info
      .id
      .name
      .description
      .serviceAccount
          .clientId
          .secretes
      .addresses          - An array of addresss locaitos in the orgnization.
      .panels             - an array of panel locations in the organization.
      .file_name
      .auth

Secrets are stored in the following format because this is how the Eaton EMCB
returns the organization secrets after creating them:
    secrets = [
	    {
    		"name": "secret1",
    		"value": "secret_value_string",
    		"expiry": "secret_expire_ISO8601"
    	},
    	{
    		"name": "secret2",
    		"value": "secret_value_string",
    		"expiry": "secret_expire_ISO8601"
    	}
    ]

Authentication token (i.e. ".auth") information is stored in an Object with
the following fields:
    .auth
        .token
        .expiresAt

Addresses and electrical panels are both treated as "locations" by the EATON 
EMCB API, but this implementation treats them separately for clarity because 
each location type has different keys stored in the object. Keys for both 
locaiton types are:
    .addresses = [address_1, address_2, ..., address_i, ..., address_n]
    address_k
        .id
        .name
        .description
        .organizationId
        .contact
        .email
        .phone
        .locationType     - will always be "address" for the addresses
        .address
            .city
            .state
            .postalCode
            .street1
    .panels = [panel_1, panel_2, ..., panel_j, ..., panel_m]
    panel_m
        .id
        .name
        .parentLocationId - this must be equal to address_k.id for some k
        .organizationId   - this must be equal to org_info.id
        .locationTye      - will always be "equipment" for electrical panels

Because this module involves working with web servers, many of the functions
are asynchronous (deonted by the async keyword in front of the fucntion 
definition). As a result, they can't be used in the same way synchronous
functions are used. Synchronous functions will be executed line-by-line
and will execute in the order they appear in the code (i.e. lines at the top
execute first, the lines at the bottom execute last). With asynchronous
functions, functions in one line will start executing before the function
in the previous line finishes executing. Therefore, to make sure information
from an asynchronous funciton before another function is called, you 
need to use the then() rather than calling functions line by line. The then() 
function has the following syntax:
    function1.then(function2, error_function)
The way to think about this line of code is, "function1 executes, *then* 
function2 executes". Here, whatever is returned by function1 is passed as
input to funciton2. If there is an error in function1, error_funciton
executes instead of function2. Both function2 and error_funciton can be 
omited as follows:
    var function1_promise = function1.then()
In this case, funciton1_promise stores whatever value function1 returns if
function1 is done executing. If it's not done executing, function1_promise
is a Promise object, not a value. Promises are used by asynchronous functions
to keep track of when infomraiton returned by an asynchronous function is
ready to be used, in which case the promise is said to be "fullfilled". For
more information on promises, see the following website:
    https://www.w3schools.com/Js/js_promise.asp
    https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
*/

// Other JS modules that this library depends on:
const axios = require('axios');      // used to handle HTML requests 
                                     // (i.e. access the EATON EMCB API)
                                     
const fileSystem = require("fs");    // used for saving data to files
const process = require("process");  // used to get current working directory
const crypto  = require('crypto');   // for UDP key encryption
const ip = require('ip');            // for figuring out UDP broadcast IP address
const os = require('os');            // for figuring out UDP broadcast IP address
const interfaces = os.networkInterfaces(); // for figuring out UDP broadcast IP address
// var localIpV4Address = require("local-ipv4-address");
const localIpV4Address = require("local-ipv4-address");
// const plotly = require("plotly.js-dist"); // used for plotting (but it's not working)


/******************************************************************************
Description (from API documentation):
- Obtain a service account authorization token for an Application or an 
  Organization.

Eaton EMCB API Function Implementation:
- 'Obtain Service Account Authorization Token'
  HTTP URL: https://api.em.eaton.com/api/v1/serviceAccount/authToken
  API info: https://api.em.eaton.com/docs#operation/postServiceAccountAuthTokens

Inputs:
- api_key:        <string>  an Application or Organization API key
- client_ID:      <string>  client ID corresponding the Application or 
                  Organization described by 'api_key'
- client_secret:  <string>  the secret key corresponding to the Application or
                  Oragnization described by 'api_key' and 'client_ID'

Outputs:
- A promise that returns an authentication token object when resolved. The
  promise resolves after receving a response form the Eaton API for the 
  'serviceAccount/authToken' HTTP request. An authentication token object has 
  the following properties:
  - .token: <string> representing the authentication token
  - .expiresAt: <string> token expiraiton date in ISO 8601 format
  Example authentication token object output after promise resolves:
    auth_token_obj = {
      'token': 'auth_token_str'
      'expiresAt': 'expiration_str_ISO_8601'
    }
Module Dependencies (defined at the beginning of the EMCB module):
 - axios: a promised-based HTTP client (TCP server)
******************************************************************************/  
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


/******************************************************************************
Description:
- A wrapper function for getAuthTocken designed to only require the 'app_info'
  object and obtains an API authorization token

Inputs:
- app_info:       <Object>  the 'app_info' ojbect described in the header
                  comments of this module. The following fields are required:
                      .api_key
                      .client_id
                      .client_secret1

Outputs:
- A promise that resolves into an updated 'app_info' object with an updated
  '.auth' property which stores the authentication token and expiration date 
  from the Eaton API obtained by 'getAuthToken()'.
  
Module Dependencies (defined at the beginning of the EMCB module):
 - axios: a promised-based HTTP client (TCP server)
******************************************************************************/ 
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
      return app_info;
    });
    // return a promise, and chain execute code after this function finishes by 
    // using .then() on the returned promise.
    return auth_info_promise;
  }
}


/******************************************************************************
Description:
- A wrapper function for getAuthTocken designed to only require the 'app_info'
  and 'org_info' objects and obtains an organization authorization token

Inputs:
- app_info:       <Object>  the 'app_info' ojbect described in the header
                  comments of this module. The following fields are required:
                      .api_key
- org_info:       <Object>  the 'org_info' ojbect described in the header
                  comments of this module. The following fields are required:
                      .client_id
                      .client_secret1

Outputs:
- A promise that resolves into an updated 'org_info' object with an updated
  '.auth' property which stores the authentication token and expiration date 
  from the Eaton API obtained by 'getAuthToken()'.
  
Module Dependencies (defined at the beginning of the EMCB module):
 - axios: a promised-based HTTP client (TCP server)
******************************************************************************/ 
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


/******************************************************************************
Description:
- This function creates an organization, adds an address to it, and creates a
  locaiton for the main breaker box within that organization according to the 
  tutorial in the Eaton Smart Breaker Developer Portal (https://portal.em.eaton.com/).

Eaton EMCB API Function Implementation:
- 'Create an Organization'
  HTTP URL: https://api.em.eaton.com/api/v1/organizations
  API info: https://api.em.eaton.com/docs#operation/postOrganizations
- another API call is used in this function, but it is defined in 
  'createLocation' below

Inputs:
- app_filename:   <string>  .json filename with the data to be stored in 'app_info'
- address_info:   <string>  client ID corresponding the Application or 
                  Organization described by 'api_key'. 'address_info' must have
                  the following fields:
                    address = {
                      "name": "Warrendale PSEC",
                      "locationType": "address",
                      "address": {
                        "city": "Warrendale",
                        "state": "Pennsylvania",
                        "postalCode": "15086",
                        "street1": "130 Commonwealth Drive"
                      }
                    };

Outputs:
- No outputs are returned, but the organization information is saved in a .json 
  file stored in the same directory as this file.
  
Module Dependencies (defined at the beginning of the EMCB module):
 - axios: a promised-based HTTP client (TCP server)
 - fs: for saving organization info to .json file
******************************************************************************/ 
async function createOrg(app_filename, address_info) {
  // createOrg() requires the address variable to be an object with the
  // following fields:
  //    
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


/******************************************************************************
Description (from API documentation):
- Creates a location. 
- A "custom" location can be created as a root level 
  location (no parentLocationId) or below another custom location. When
  creating a "custom" location, you must include a customTypeInfo field.
- An "address" location can be created as a root level location
  (no parentLocationId) or below a custom location. You may not create an
  "address" location above or below another "address" location. When creating
  an "address" location, you must include an address field. Any optional empty
  or whitespace entries in the address fields are going to be removed.
- An "equipment" location must be created below an "address" location. No
  additional fields are required for creating an "equipment" location.

Eaton EMCB API Function Implementation:
- 'Create Location'
  HTTP URL: https://api.em.eaton.com/api/v1/locations
  API info: https://api.em.eaton.com/docs#operation/createLocation

Inputs:
- app_info:       <Object>  The app_info object explained above, where only
                  the '.api_key' property is required.
- org_info:       <Object>  The org_info object explained above, where only
                  the '.id', .client_id' and '.client_secret1' properties are
                  required.
- location_info:  <Object>  The information describing the new locaiton. The
                  properties needed depend on if creating an 'Address' or 
                  'Equipment' location, so see 'createAddress()' and 
                  'createPanel()' documentation below for examples of each.

Outputs:
- A promise that resolves into an object containing location information. The
  exact properties in this object depend on if creating an 'Address' or
  'Equipment' location, so see 'createAddress()' and 'createPanel()' 
  documentation below for examples of each.

Module Dependencies (defined at the beginning of the EMCB module):
 - axios: a promised-based HTTP client (TCP server)
******************************************************************************/  
async function createLocation(app_info, org_info, location_info) {
  // get organization's authentication token
  var org_auth_promise = getOrgAuthToken(app_info, org_info);
  
  // create a location for EMCB's to exist in
  var location_added_promise = org_auth_promise.then(() => {
    // define HTTP request data
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
    
    // make HTTP request with axios
    var location_response_prom = axios(location_request);
    
    // filtering out unnecessary info in the HTTP response, where we only need
    // the 'location_response.data.data' property
    var update_org_prom = location_response_prom.then((location_response) => {
      return location_response.data.data;
      /* example output for an address
        location_response.data.data = {
          "id": "9e124983-31aa-40ba-a979-4bacb17fbcee",
          "name": "Address 5",
          "organizationId": "7bc05553-4b68-44e8-b7bc-37be63c6d9e9",
          "description": "A nice location",
          "parentLocationId": "67fb6396-e2af-44f1-a41b-4b26d7bb9b49",
          "contact": "Stephanie King",
          "email": "stephanie.king@example.com",
          "phone": "1-555-555-1212",
          "locationType": "equipment"
        }
      */
    });
    return update_org_prom;
  });
  
  // return a promise that resolves to 'location_response.data.data'
  return location_added_promise;
}


/******************************************************************************
Description:
- A wrapper function that call 'createLocation()' when creating an 'Address'
  (i.e. not an 'Equipment') location.

Inputs:
- app_info:       <Object>  The app_info object explained above, where only
                  the '.api_key' property is required.
- org_info:       <Object>  The org_info object explained above, where only
                  the '.id', .client_id' and '.client_secret1' properties are
                  required.
- address_info:   <Object>  The information describing the address. The
                  required properties are below, but others can be included:
                      address_info = {
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
                      }

Outputs:
- A promise that resolves into an object containing address information. 
  Addresses are stored in the 'org_info.address' property (an array). Each
  'org_info.addresses' element can have the following properties, but not all
  are required:
            org_info.addresses[i] = {
              "id": "cfd1375b-87ac-4d89-8848-e00c70a1fd14", // Address ID
              "name": "The Address Location Name",
              "locationType": "address",
              "description": "An example address",
              "organizationId": "265cdaed-c4ee-47f1-a66c-0cdf9aab568e", // Organization ID
              "address": {
                  "city": "city",
                  "state": "state",
                  "postalCode": "postalCode",
                  "street1": "street1",
                  "street2": "street2",
                  "coordinates": {
                      "latitude": "60",
                      "longitude": "89"
                  }
              }
            }

Module Dependencies (defined at the beginning of the EMCB module):
 - axios: a promised-based HTTP client (TCP server)
******************************************************************************/ 
async function createAddress(app_info, org_info, address_info) {
  var location_promise = createLocation(app_info,org_info,address_info);
  var update_org_promise = location_promise.then((new_address_info) => {
    org_info.addresses.push(new_address_info);
    return org_info;
  });
  return update_org_promise;
  /*
        "org_info.address[org_info.locations.length - 1]" = {
            "id": "cfd1375b-87ac-4d89-8848-e00c70a1fd14", // Address ID
            "name": "The Address Location Name",
            "locationType": "address",
            "description": "An example address",
            "organizationId": "265cdaed-c4ee-47f1-a66c-0cdf9aab568e", // Organization ID
            "address": {
                "city": "city",
                "state": "state",
                "postalCode": "postalCode",
                "street1": "street1",
                "street2": "street2",
                "coordinates": {
                    "latitude": "60",
                    "longitude": "89"
                }
            }
        }
  */
}


/******************************************************************************
Description :
- A wrapper function that call 'createLocation()' when creating an 'Equipment'
  (i.e. not an 'Address') location. Use this to create locations for different
  panel boxes.

Inputs:
- app_info:       <Object>  The app_info object explained above, where only
                  the '.api_key' property is required.
- org_info:       <Object>  The org_info object explained above, where only
                  the '.id', .client_id' and '.client_secret1' properties are
                  required.
- panel_info:     <Object>  The information describing the panel. The
                  required properties are below, but others can be included:
                  panel_info = {
                    organizationId: org_info.id,
                    name: "The Equipment Location Name",
                    parentLocationId: org_info.addresses[0].id, 
                    locationType: "equipment"
                  };

Outputs:
- A promise that resolves into an object containing panel location information. 
  Panel info is stored in the 'org_info.panels' property (an array). Each
  'org_info.panel' element can have the following properties, but not all
  are required:
            org_info.panels[i] = {
                "id": "37884e82-e81f-4932-aec0-96028aab5d0b",
                "name": "The Equipment Location Name",
                "locationType": "equipment",
                "description": "An example equipment location",
                "organizationId": "265cdaed-c4ee-47f1-a66c-0cdf9aab568e",
                "parentLocationId": "cfd1375b-87ac-4d89-8848-e00c70a1fd14"
                "contact": "Hugo Stotz",
                "email": "hugo@eaton.com",
                "phone": "(101) 123-4567"
            }

Module Dependencies (defined at the beginning of the EMCB module):
 - axios: a promised-based HTTP client (TCP server)
******************************************************************************/ 
async function createPanel(app_info, org_info, panel_info){
  var location_promise = createLocation(app_info,org_info,panel_info);
  var update_org_promise = location_promise.then((new_panel_info) => {
    org_info.panels.push(new_panel_info);
    return org_info;
  });
  return update_org_promise;
}


/******************************************************************************
Description (from API documentation):
- List all organizations associated with the 'app_info' object.

Eaton EMCB API Function Implementation:
- 'Get Organizations'
  HTTP URL: https://api.em.eaton.com/api/v1/organizations
  API info: https://api.em.eaton.com/docs#operation/postOrganizations

Inputs:
- app_info:       <Object>  See above - all fields required.


Outputs:
- A promise that resovles into a array of 'org_info' objects, where each 
  element in the array has all the fields in the 'org_info' object listed above.
  
Module Dependencies (defined at the beginning of the EMCB module):
 - axios: a promised-based HTTP client (TCP server)
******************************************************************************/  
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
  
  var one_min_in_milisec = 60*1e3;
  return isExpired(auth_info,safety_factor = one_min_in_milisec) === false;
} 

function isExpired(token_or_key, safety_factor=60*1e3) {
  // code for comparing ISO 8601 times is from:
  //    https://stackoverflow.com/questions/18023857/compare-2-iso-8601-timestamps-and-output-seconds-minutes-difference
  //    https://developer.mozilla.org/en-US/docs/web/javascript/reference/global_objects/date
  var time1_Date_obj = new Date(token_or_key.expiresAt);
  var now_in_ms = Date.now();
  var time_diff_in_ms = time1_Date_obj-now_in_ms; // positive if time1_Date_obj 
                                                  // is in the future
  if (time_diff_in_ms > safety_factor) {
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

async function isConnected(app_info,org_info,deviceID) {
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

async function getOrgs(app_info) {
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


// UDP Server Stuff
// There exists a depricated, incomplete javascript module created by Eaton
// that implements the EMCB UDP API (https://api.em.eaton.com/docs/emlcp.html).
// The github for Eaton's UDP JS module hasn't been updated in 4 years, and the 
// comments say the module is incomplete. Therefore, I am copying/pasting
// relevant code here rather than importing the depricated module here.
// Constants are from the 'emcbUDPconstants.js' module:
// https://github.com/EatonEM/emcb-udp-master/blob/master/lib/emcbUDPconstants.js
const EMCB_UDP_MESSAGE_CODE_GET_NEXT_SEQUENCE_NUMBER = 0x0000;
const EMCB_UDP_MESSAGE_CODE_GET_DEVICE_DEBUG_DATA = 0x00FE;
const EMCB_UDP_MESSAGE_CODE_GET_DEVICE_STATUS = 0x00FF;
const EMCB_UDP_MESSAGE_CODE_GET_BREAKER_REMOTE_HANDLE_POSITION = 0x0100;
const EMCB_UDP_MESSAGE_CODE_GET_METER_TELEMETRY_DATA = 0x0200;
const EMCB_UDP_HEADER_START_MASTER = "ETNM"; // Start Byte of all Master->Slave requests
const EMCB_UDP_HEADER_START_SLAVE = "ETNS"; // Start Byte of all Slave->Master responses

async function createUDPKey(app_info,org_info,keyType) {
  var org_auth_promise = getOrgAuthToken(app_info,org_info);
  
  return org_auth_promise.then((org_info) => {
    var request = {
      "method": "POST",
      "url": "https://api.em.eaton.com/api/v1/udpKeys",
      "headers": {
          "Em-Api-Subscription-Key": app_info.api_key,
          "Authorization": "Bearer " + org_info.auth.token,
          "Accept": "application/json",
          "Content-Type": "application/json"
      }
    };
    var payload = {
      "keyType": keyType
    };
    request.data=payload;
    
    return axios(request).then((response) => {
      return response.data.data;
    });
  });
}

async function getUDPKeys(app_info,org_info,keyID="") {
  var org_auth_promise = getOrgAuthToken(app_info,org_info);
  
  return org_auth_promise.then((org_info) => {
    var request = {
      "method": "GET",
      "url": "https://api.em.eaton.com/api/v1/udpKeys",
      "headers": {
          "Em-Api-Subscription-Key": app_info.api_key,
          "Authorization": "Bearer " + org_info.auth.token,
          "Accept": "application/json",
          "Content-Type": "application/json"
      }
    };
    if (keyID !== ""){
      request.url = request.url + "/" + keyID;
    }
    
    return axios(request).then((response) => {
      return response.data.data;
    });
  });
}

async function deleteUDPKey(app_info,org_info,keyID) {
  var org_auth_promise = getOrgAuthToken(app_info,org_info);
  
  return org_auth_promise.then((org_info) => {
    var request = {
      "method": "DELETE",
      "url": "https://api.em.eaton.com/api/v1/udpKeys/" + keyID,
      "headers": {
          "Em-Api-Subscription-Key": app_info.api_key,
          "Authorization": "Bearer " + org_info.auth.token,
          "Accept": "application/json",
          "Content-Type": "application/json"
      }
    };
    
    return axios(request).then((response) => {
      return response.data.data;
    });
  });
}

async function deleteAllUDPKeys(app_info,org_info) {
  console.log('Deleting all UDP keys...');
  var org_auth_promise = getOrgAuthToken(app_info,org_info);
  
  return org_auth_promise.then((org_info) => {
    return getUDPKeys(app_info,org_info).then((UDPkeys) => {
      var numKeys = UDPkeys.length;
      var promises = [];
      for (var i=0; i<numKeys; i=i+1) {
        promises[i] = deleteUDPKey(app_info,org_info,UDPkeys[i].id);
      }
      return Promise.all(promises).then(() => {
        console.log("Done deleting UDP keys.");
      });
    });
  });
}

async function assignUDPKey(app_info,org_info,keyID,priority,deviceID) {
  var org_auth_promise = getOrgAuthToken(app_info,org_info);
  
  return org_auth_promise.then((org_info) => {
    var request = {
      "method": "POST",
      "url": "https://api.em.eaton.com/api/v1/devices/" + deviceID + "/udpKeys",
      "headers": {
          "Em-Api-Subscription-Key": app_info.api_key,
          "Authorization": "Bearer " + org_info.auth.token,
          "Accept": "application/json",
          "Content-Type": "application/json"
      }
    };
    var payload = {
      "keyId": keyID,
      "priority": priority // either "primary" or "secondary"
    };
    request.data = payload;
    
    return axios(request).then((response) => {
      return response.data.data;
    });
  });
}

async function asyncWait(miliseconds) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve('resolved');
    }, miliseconds);
  });
}

async function asyncWaitOneDay() {
  var ms_per_sec = 1000;
  var sec_per_min = 60;
  var min_per_hour = 60;
  var hour_per_day = 24;
  var ms_per_day = ms_per_sec*sec_per_min*min_per_hour*hour_per_day;
  return asyncWait(ms_per_day);
}

async function monitorUDPKeys(app_info,org_info) {
  console.log('Checking UDP keys...');

  // this function will assign UDP keys initially, then check periodically for
  // keys near expiration, then replaces nearly expired keys with new ones
  
  // key rotation protocol is explained in:
    // https://portal.em.eaton.com/advancedTopics/localCommunication#keyLifetimeAndRotation
  // essentially, you have two "types" of UDP keys: a "broadcast" key (send data
  // to/from all EMCBs), and a unicast key (send data to/from one EMCB). Each
  // EMCB can store two UDP keys of each type with one of two "priorities": 
  // "primary" or "secondary". The level of priority arbitrary and only serves
  // to distinguish between the two keys of each type. KEYS EXPIRE AFTER 7 DAYS, 
  // SO HAVE 2 KEYS OF EACH TYPE ENSURES THAT YOU WILL NEVER LOSE CONNECTION
  // WITH THE UDP SERVER, EVEN AFTER A KEY EXIPRES. HOWEVER, YOU MUST THEN
  // ROTATE FROM USING THE PRIMARY KEY TO USING THE SECONDARY KEY IF THE PRIMARY  
  // KEY IS GOING TO EXPIRE SOON (SOON = <2 DAYS HERE).
  
  // get all devices
  var org_auth_promise = getOrgAuthToken(app_info,org_info);
  
  org_auth_promise.then(async (org_info) => {
    getDevices(app_info, org_info).then(async (devices) => {
      getUDPKeys(app_info,org_info).then(async (UDPkeys) => {
        var numDevices = devices.length;
        var numKeys = UDPkeys.length;
        console.log("Current UDP keys:");
        console.log(UDPkeys);

        // if a UDP key exists for a devices[i], then has_xxxx_xxxx[i] will
        // store the UDP key ID for that device to be used later. Otherwise,
        // has_xxxx_xxxx[i] = "false", and this can be used later to check if keys exist
        var key_count_broad = new Array(numDevices).fill(0);
        var key_count_uni = new Array(numDevices).fill(0);
        
        var has_broad_primary = new Array(numDevices).fill("false");
        var has_broad_secondary = new Array(numDevices).fill("false");
        var has_uni_primary = new Array(numDevices).fill("false");
        var has_uni_secondary = new Array(numDevices).fill("false");
        
        var expired_broad_primary = new Array(numDevices).fill(false);
        var expired_broad_secondary = new Array(numDevices).fill(false);
        var expired_uni_primary = new Array(numDevices).fill(false);
        var expired_uni_secondary = new Array(numDevices).fill(false);
        
        for (var j = 0; j < numKeys; j = j+1){
          var UDPkey = UDPkeys[j];
          if (UDPkey.deviceIds === []) {
            deleteUDPKey(app_info,org_info,UDPkey.id); // delete old secondary key, doesn't need to be asynchrnous
            continue;
          }
          
          var is_broadcast_key = (UDPkey.keyType === "broadcast");
          var is_unicast_key = (UDPkey.keyType === "unicast");

          var ms_per_second = 1000;
          var second_per_hour = 3600;
          var hours_per_day = 24;
          var ms_per_day = ms_per_second*second_per_hour*hours_per_day;
          var num_days = 2;
          var safety_factor = ms_per_day*num_days; 
          var is_expired = isExpired(UDPkey, safety_factor); // any key that will expire in less than 2 days is considered expired here when regenerating keys
          
          for (var i = 0; i < numDevices; i = i+1){
            device = devices[i];
            
            if (device.id !== UDPkey.deviceIds[0]) {
              // check if device ID matches UDPkey device ID, continue to
              // next device if not in devices if not
              continue;
            }
            
            if (is_broadcast_key) {
              if (key_count_broad[i]===0) {
                has_broad_primary[i] = UDPkey.id;
                if (is_expired) {
                  expired_broad_primary[i] = true;
                }
                key_count_broad[i] = 1;
              } else if (key_count_broad[i]===1) {
                has_broad_secondary[i] = UDPkey.id;
                if (is_expired) {
                  expired_broad_secondary[i] = true;
                }
                key_count_broad[i] = 2;
              }
            } else if (is_unicast_key) { // unicast keys
              if (key_count_uni[i] === 0) {
                has_uni_primary[i] = UDPkey.id;
                if (is_expired) {
                  expired_uni_primary[i] = true;
                }
                key_count_uni[i] = 1;
              } else if (key_count_uni[i]===1) {
                has_uni_secondary[i] = UDPkey.id;
                if (is_expired) {
                  expired_uni_secondary[i] = true;
                }
                key_count_uni[i] = 2;
              }
            } else {
              throw new Error("Error: this line should be unreachable unless the EMCB API changed");
            }
          }
        }
        
        var promises = [];
        var count = 0;
        for (var i = 0; i < numDevices; i = i+1) {
          var device = devices[i];

          // first for broadcast keys...
          // if primary key and secondary key do not exist...
          if (key_count_broad[i] === 0) {
            var first_broad_promise = createUDPKey(app_info,org_info,"broadcast"); // create new primary key
            first_broad_promise.then((new_key) => {
              // console.log(device.id);
              assignUDPKey(app_info,org_info,new_key.id,"primary",device.id); // assign new primary key
            });
            promises[count++] = first_broad_promise;
          }
          
          // if primary key exists and expires in less than 2 days
          if ((key_count_broad[i] >= 1) && (expired_broad_primary[i])) {
            var sec_broad_promise = createUDPKey(app_info,org_info,"broadcast"); // create new secondary key
            sec_broad_promise.then((new_key) => {
              if (key_count_broad[i] >= 2) { // if secondary key already exists
                deleteUDPKey(app_info,org_info,has_broad_secondary[i]); // delete old secondary key, doesn't need to be asynchrnous
              }
              assignUDPKey(app_info,org_info,new_key.id,"secondary",device.id); // assign new secondary key
            });
            promises[count++] = sec_broad_promise;
          }
          
          // if secondary key exists and expires in less than 2 days
          if ((key_count_broad[i] >= 2) && expired_broad_secondary[i]) {
            var prim_broad_promise = createUDPKey(app_info,org_info,"broadcast"); // create new primary key
            prim_broad_promise.then((new_key) => {
              if (key_count_broad[i] >= 1) { // if primary key already exists
                deleteUDPKey(app_info,org_info,has_broad_primary[i]); // delete old primarry key, doesn't need to be asynchrnous
              }
              assignUDPKey(app_info,org_info,new_key.id,"primary",device.id); // assign new primary key
            });
            promises[count++] = prim_broad_promise;
          }
          
          // repeat for unicast keys...
          // if primary key and secondary key do not exist...
          if (key_count_uni[i] === 0) {
            var first_uni_promise = createUDPKey(app_info,org_info,"unicast"); // create new primary key
            first_uni_promise.then((new_key) => {
              // console.log(device.id);
              assignUDPKey(app_info,org_info,new_key.id,"primary",device.id); // assign new primary key
            });
            promises[count++] = first_uni_promise;
          }
          
          // if primary key exists and expires in less than 2 days
          if ((key_count_uni[i] >= 1) && expired_uni_primary[i]) {
            var sec_uni_promise = createUDPKey(app_info,org_info,"unicast"); // create new secondary key
            sec_uni_promise.then((new_key) => {
              if (key_count_uni[i] == 2) { // if secondary key already exists
                deleteUDPKey(app_info,org_info,has_uni_secondary[i]); // delete old secondary key, doesn't need to be asynchrnous
              }
              assignUDPKey(app_info,org_info,new_key.id,"secondary",device.id); // assign new secondary key
            });
            promises[count++] = sec_uni_promise;
          }
          
          // if secondary key exists and expires in less than 2 days
          if ((key_count_uni[i] == 2) && expired_uni_secondary[i]) {
            var prim_uni_promise = createUDPKey(app_info,org_info,"unicast"); // create new primary key
            prim_uni_promise.then((new_key) => {
              if (key_count_uni[i] == 2) { // if primary key already exists
                deleteUDPKey(app_info,org_info,has_uni_primary[i]); // delete old primarry key, doesn't need to be asynchrnous
              }
              assignUDPKey(app_info,org_info,new_key.id,"primary",device.id); // assign new primary key
            });
            promises[count++] = prim_uni_promise;
          }
          
          await Promise.all(promises);
        }
        
        // wait a day asynchronously, then call this function recursively
        asyncWait(20000).then(() => { 
          getUDPKeys(app_info,org_info).then((UDPkeys) => {
            console.log("New UDP keys:");
            console.log(UDPkeys);
            console.log('waiting 1 day to recheck for UDP key expiration...');
            asyncWaitOneDay().then(() => {
              monitorUDPKeys(app_info,org_info);
            });
          });
        });
      });
    });
  });
}

// this function is from the depricated and incomplete Eaton UDP github library.
// Specificially, this is from the 'emcbUDPutils.js' module:
// https://github.com/EatonEM/emcb-udp-master/blob/master/lib/emcbUDPutils.js
function createEMCBudpBuffer(sequenceNumber, messageCode, messageData, signingKey){

  if(!Buffer.isBuffer(signingKey)){
    throw new Error("Invalid signingKey.  Expected signingKey to be type Buffer but got " + typeof signingKey);
  }

  // Allocate our immutable length header buffer
  var header = Buffer.alloc(10);

  // start with the "ETNM" Start bytes
  header.write(EMCB_UDP_HEADER_START_MASTER, 0);	 //0x45, 0x54, 0x4E, 0x4D

  // Add the Sequence Number
  header.writeUInt32LE(sequenceNumber, 4);

  // And the Message Code
  header.writeUInt16LE(messageCode, 8);

  // Create our body object and add our data to it, if it exists
  var body = Buffer.from((messageData ? messageData : ""));

  // Create our data object to sign
  var data = Buffer.concat([header, body]);

  // Calculate our signature
  var signature = crypto
                  .createHmac('sha256', signingKey)
                  .update(data)
                  .digest();

  // Return the packet
  return Buffer.concat([data, signature]);
}

function incrementSequenceNumber(seqNum, amount){
  seqNum += amount || 1;
  if(seqNum > 0xFFFFFFFF){
    seqNum = 0;
  }
  return seqNum;
}

function getIpAddress(ifaceName){
	return new Promise((resolve, reject) => {
		if(ifaceName){
			var filtered = interfaces[ifaceName].filter(details => {
				return details.family === "IPv4";
			});

			if(filtered.length){
				return resolve(filtered[0].address);
			}

			throw new Error("Unable to retrieve ipAddress for iface " + ifaceName);
		} else {
			return localIpV4Address()
						.then(resolve)
						.catch(reject);
		}
	});
}

function getBroadcastAddress(ifaceName){
	return getIpAddress(ifaceName)
		.then(ipAddress => {
			for (var iface in interfaces){
				var filtered = interfaces[iface].filter(details => {
					return details.address === ipAddress;
				});

				if(filtered.length){
					return ip.or(ip.not(filtered[0].netmask), filtered[0].address);
				}
			}

			throw new Error("Unable to retrieve broadcast address for ipAddress " + ipAddress);
		});
}

function getUDPport() {
  // UDP prot must be 32866 for EMCBs (spells "EATON" on keypad)
  // This port number is hardcoded into the EMCB firmware 
  return 32866; 
}

function getNewSequenceNumber() {
  return crypto.randomBytes(4).readUInt32LE(0); // line 53 from https://github.com/EatonEM/emcb-udp-master/blob/master/lib/emcbUDPbroadcastMaster.js
}

async function UDPsend(message_info, sequenceNumber) { 

  if(sequenceNumber === undefined) {    // Can't use cute syntax like sequenceNumberOverride || this._sequenceNumber because we expect the override to generally be 0.
    sequenceNumber = getNewSequenceNumber();
  } // else its already a number and we should use it

  var message_buffer = createEMCBudpBuffer(sequenceNumber, message_info.messageCode, message_info.messageData, message_info.udpKey);
  var newSequenceNumber = incrementSequenceNumber(this._sequenceNumber);

  var lastMessageSendTime = (new Date()).getTime();
  
  var port = message_info.UDPport;
  var ip_address = message_info.broadcastIP;
  message_info.socket.send(message_buffer,port,ip_address);
  
  var output = {
    sequenceNumber: newSequenceNumber,
    lastSendTime: lastMessageSendTime
  };
  return output;
}

async function getTelemetryDataUDP(UDPsocket,broadcastIP,sequenceNumber,UDPkey) {
  var message_info = {
    messageCode:  EMCB_UDP_MESSAGE_CODE_GET_METER_TELEMETRY_DATA,
    messageData:  undefined,
    socket:       UDPsocket,
    broadcastIP:  broadcastIP,
    UDPport:      getUDPport(),
    UDPkey:       UDPkey
  };
  var output = UDPsend(sequenceNumber, message_info);
  return output;
}

async function pollAllUDP(udp_socket,devices,UDPkeys) {
  // var org_auth_promise = getOrgAuthToken(app_info,org_info);
  
  // org_auth_promise.then(async (org_info) => {
  //   getDevices(app_info, org_info).then(async (devices) => {
  //     getUDPKeys(app_info,org_info).then(async (UDPkeys) => {
        var numDevices = devices.length;
        var numKeys = UDPkeys.length;
        console.log("Current UDP keys:");
        console.log(UDPkeys);
        
        var sequence_num = getNewSequenceNumber();
        var [sequence_num, message_time] = getTelemetryDataUDP(udp_socket,UDP_BROADCAST_IP,sequence_num,UDPkey);
      // }
    // }
  // }
  // activeMessage.tx.message = emcbUDPutils.createEMCBudpBuffer(activeMessage.tx.sequenceNumber, activeMessage.tx.messageCode, activeMessage.tx.messageData, activeMessage.tx.udpKey)
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
  isEqualObjects, getRemoteHandlePos, isConnected, getOrgs, getUDPKeys,
  createUDPKey, deleteUDPKey, assignUDPKey, asyncWait, asyncWaitOneDay,
  monitorUDPKeys, isExpired, deleteAllUDPKeys, createEMCBudpBuffer, 
  incrementSequenceNumber, getIpAddress, getBroadcastAddress, UDPsend, 
  getUDPport, getTelemetryDataUDP, pollAllUDP
  // EMCB_UDP_MESSAGE_CODE_GET_NEXT_SEQUENCE_NUMBER,
  // EMCB_UDP_MESSAGE_CODE_GET_DEVICE_DEBUG_DATA,
  // EMCB_UDP_MESSAGE_CODE_GET_DEVICE_STATUS,
  // EMCB_UDP_MESSAGE_CODE_GET_BREAKER_REMOTE_HANDLE_POSITION,
  // EMCB_UDP_MESSAGE_CODE_GET_METER_TELEMETRY_DATA
};