(function main() {
  const fileSystem = require("fs");    // used for saving org data to app[x].JSON file
  const emcb = require("./emcb_lib.js");
  
  var app_file = "Eaton_PSEC_EMCBs_old.json"; // MUST BE .JSON FORMAT!! For info about JSON format: https://www.w3schools.com/whatis/whatis_json.asp
  var app_info = emcb.readJSON(app_file);
  var installer_file = "installer2.json"; // MUST BE .JSON FORMAT!! For info about JSON format: https://www.w3schools.com/whatis/whatis_json.asp
  var installer_info = emcb.readJSON(installer_file);
  
  emcb.listOrgs(app_info);
  var org_id = "6e956b42-8bee-492f-a8d8-a6c3bd601061";
  emcb.getOrgInfo(app_info,org_id).then((org_info) => {
    emcb.rotateSecret(app_info,org_info,'secret1');
    emcb.rotateSecret(app_info,org_info,'secret2');
    // emcb.deleteInstaller(app_info,org_info,installer_info);
  });
})();