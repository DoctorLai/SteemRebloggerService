/*
Usage: pm2 start reblogger.js
Alternatively: node reblogger.js &   
and run disown to detach
*/

const fs = require("fs");
const steem = require('steem');
const utils = require('utils');

// read configure file
var config = JSON.parse(fs.readFileSync("config.json"));

// Connect to the specified RPC node
var rpc_node = config.rpc_nodes ? config.rpc_nodes[0] : (config.rpc_node ? config.rpc_node : 'https://api.steemit.com');
steem.api.setOptions({ transport: 'http', uri: rpc_node, url: rpc_node });

// every config.interval seconds 
setInterval(startProcess, config.interval * 1000);

// main entry point
function startProcess() {
  startReblogging(config.tags, config.blacklist);
}

// check if y array includes any x 
const arrayInArray = (x, y) => {
  if (!x) { return false; }
  for (let i = 0; i < x.length; ++ i) {
    if (y.includes(x[i])) {
      return true;
    }
  }
  return false;
}

// reblog
const reblog = (author1, permlink1) => {
  const json = JSON.stringify(['reblog', {
    account: config.account,
    author: author1,
    permlink: permlink1,
  }]);              
  steem.broadcast.customJson(config.posting_key, [], [config.account], 'follow', json, (err, result) => {
      if (result && !err) {
        log("resteemed!");
      } else {
        log(err);
      }
  });  
}

// parameter: tags0 - the tags we are interested
// parameter: blacklist - author id array
const startReblogging = async(tags0, blacklist) => {
  log("Listening to Steem Blockchain...")
  steem.api.streamOperations((err, result) => {
    if (result && !err) {
      if (result[0] == 'comment') {
        let author1 = result[1]['author'];
        let permlink1 = result[1]['permlink'];
        let json_metadata = result[1]['json_metadata'];
        let parent_author = result[1]['parent_author'];
        let parent_permlink = result[1]['parent_permlink'];
        let tags = [];
        if (json_metadata) {
          tags = JSON.parse(json_metadata.trim());
          if (tags) {
            tags = tags.tags;
          }
        }
        if (parent_author===''&& (!permlink1.startsWith("re-")))  { // not a comment
          if (arrayInArray(tags, tags0)) { // filter by tags
            if (blacklist.includes(author1)) { // black list filter
              log("blacklist author: " + author1);
            } else {
              log("resteem @" + author1 + "/" + permlink1);
              // resteeem it
              reblog(author1, permlink1);   
            }       
          }
        }          
      }    
    } else {
      log('steem.api.streamOperations: ' + err);
      failover();
    }
  });
}

function failover() {
  if (config.rpc_nodes && config.rpc_nodes.length > 1) {
    var cur_node_index = config.rpc_nodes.indexOf(steem.api.options.url) + 1;

    if (cur_node_index == config.rpc_nodes.length)
      cur_node_index = 0;

    var rpc_node = config.rpc_nodes[cur_node_index];

    steem.api.setOptions({ transport: 'http', uri: rpc_node, url: rpc_node });
    log('');
    log('***********************************************');
    log('Failing over to: ' + rpc_node);
    log('***********************************************');
    log('');
  }
}
                
function log(msg) { console.log(new Date().toString() + ' - ' + msg); }                          
