// Use this script to save an application's API key, client ID, and client
// secrets to a file in a JSON format with field names that the EMCB library
// will recognize.
(function main() {
  const fileSystem = require("fs");    // used for saving org data to app[x].JSON file
  const emcb = require("./repo/emcb_lib.js"); // custom module wit common functions used when interacting with Eaton EMCB API

  // For application "AsyncTest":
  var filename = "Eaton_PSEC_EMCBs.json"; // MUST BE .JSON FORMAT!! For info about JSON format: https://www.w3schools.com/whatis/whatis_json.asp
  var output = {
    api_key: "4a9738d35f7e4708bd9acbda32a7b7dc",
    client_id: "4b3e1f63-5369-4a70-b3f1-81c938e425d1",
    client_secret1: "dJrGuPqRWO6z0-gJ192hsKLBLeJmw1g7keydwN2o",
    client_secret2: "XZatuaV_TsexoHxgWqNjlHwzoxk8Q0eacieoy7Tr"
  };

  var len = filename.length;
  var json_ext = ".json";
  var len_json = json_ext.length;
  var file_no_ext = filename.substring(0,len-len_json);
  var ext_check = filename.substring(len-len_json,len);
  if (!(ext_check===json_ext)) {
    throw(new Error("Filename must have a .json extension!"));
  }
  var i = 1;
  while (fileSystem.existsSync(filename)) {
    filename = file_no_ext + "(" + i + ").json";
    i = i+1;
  }
  
  console.log('saving important info to ' + filename + '...');
  var output_str = JSON.stringify(output,null,'\t');
  fileSystem.writeFile(filename, output_str, (error) => {
    if (error) throw error;
  });
})();