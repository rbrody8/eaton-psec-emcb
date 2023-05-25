// Use this script to save an application's API key, client ID, and client
// secrets to a file in a JSON format with field names that the EMCB library
// will recognize.
(function main() {
  const fileSystem = require("fs");    // used for saving org data to app[x].JSON file

  // For application "AsyncTest":
  var filename = "Eaton_PSEC_EMCBs.json"; // MUST BE .JSON FORMAT!! For info about JSON format: https://www.w3schools.com/whatis/whatis_json.asp
  var output = {
    api_key: "3550db6ae64b45839b66850969b628a9",
    client_id: "d38f4f39-8cd2-4df1-b440-6b38894db3be",
    client_secret1: "hwaT9412yMbceDCluIfOF8vfV8hhFRpA-SnRXG6b",
    client_secret2: "wSmjlGizUpy45ew-9V3Ge6DoAe32Xtdo8mPzzOpB"
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