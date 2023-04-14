// Use this script to save an application's API key, client ID, and client
// secrets to a file in a JSON format with field names that the EMCB library
// will recognize.
(function main() {
  const fileSystem = require("fs");    // used for saving org data to app[x].JSON file
  const emcb = require("./emcb_lib.js"); // custom module wit common functions used when interacting with Eaton EMCB API

  // For application "AsyncTest":
  var app_file = "Eaton_PSEC_EMCBs.json"; // MUST BE .JSON FORMAT!! For info about JSON format: https://www.w3schools.com/whatis/whatis_json.asp
  var app_info = emcb.readJSON(app_file);
  var org_file = "org_PSEC.json";
  var org_info = emcb.readJSON(org_file);
  var installer_info = {
    "email": "rmb147@pitt.edu",
    // "roleId": *call emcb.getRoles(app_info,org_info) to get this value,
    "organizationId": org_info.id
  };
  
  emcb.getRoles(app_info,org_info).then((response) => {
    installer_info.roleId = response[0].id;
    emcb.getInstallers(app_info,org_info,installer_info).then(() => {
      emcb.inviteInstaller(app_info,org_info,installer_info);
    });
  });
})();