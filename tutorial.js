(function main() {
    const emcb = require("./emcb_lib.js"); // custom module wit common functions used when interacting with Eaton EMCB API

    // STEP 1: APPLICATION API KEY
    const app_file = "Eaton_PSEC_EMCBs.json";
    var app_info = emcb.readJSON(app_file);

    // STEPS 2-6: 2 METHODS EXISTS
    // METHOD 1: Use emcb.createOrg() (commented out to avoid maxing out organizaiton quotas)
    /*
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
    emcb.createOrg(app_file, address_info);
    */
    //
    // METHHOD 2: Read in organizaiton info from a .json file (recommended to avoid maxing out resource quotas)
    var org_filename = "org_PSEC.json";
    var org_info = emcb.readJSON(org_filename);

    // STEP 7: GET VALID USER ROLES
    var get_roles_promise = emcb.getRoles(app_info,org_info);
    
    // STEP 8: INVITE INSTALLER
    get_roles_promise.then(function(role_ids) {
        var installer_role_id = role_ids[0]; // there is only 1 role ID available
        var installer_info = {
            roleId: installer_role_id,
            name: 'Example Name',
            email: 'example_email@eaton.com',
            organizationId: "a0321685-c724-42e9-a7fa-71fa0e276555"
        };
        emcb.inviteInstaller(app_info, org_info, installer_info);
    });
    
    
    // STEP 9: COMMISSION A DEVICE
    // Complete using eaton EM Install app
    
    
    
    emcb.getDevices(app_info, org_info).then(function(response) {
        // STEP 10: LIST ALL ADDED DEVICES
        console.log("Array of device ID's for online EMCBs:");
        console.log(response);
        console.log();
        console.log();
        
        // STEP 11: CONTROL A DEVICE:
        // turn all breakers on (i.e. close them)
        var reason = 'tutorial demonstration';
        var all_turn_on_promises = [];
        for (var device_id in response) {
            var new_on_promise = emcb.closeBreaker(app_info, org_info, device_id, reason);
            all_turn_on_promises.push(new_on_promise);
        }
        
        // wait for all devices to turn on...
        Promise.all(all_turn_on_promises).then(function() {
            // ...then turn on all breakers off (i.e. open them)
            for (var device_id in response) {
                emcb.openBreaker(app_info, org_info, device_id, reason);
            }
        });
    });
    
    
})();