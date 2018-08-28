'use strict';

const fs = require("fs");
const steem = require('steem');

const CONFIG_FILE = "config.json";

var config = JSON.parse(fs.readFileSync(CONFIG_FILE));

// Connect to the specified RPC node
var rpc_node = config.rpc_nodes ? config.rpc_nodes[0] : (config.rpc_node ? config.rpc_node : 'https://api.steemit.com');
steem.api.setOptions({ transport: 'https', uri: rpc_node, url: rpc_node });

// only allows 1 thread at a time
var lock = false;

function runInterval(func, wait, times){
  let interv = function(w, t){
    return function(){
      if (typeof t === "undefined" || t-- > 0){
        setTimeout(interv, w);
        try {
          func.call(null);
        }
        catch(e){
          t = 0;
          throw e.toString();
        }
      }
    };
  }(wait, times);
  setTimeout(interv, wait);
};

// every config.interval seconds 
runInterval(startProcess, config.interval * 1000, 99999999);

startProcess();

// check if y array includes any x 
const arrayInArray = (x, y) => {
  if (!x) { return false; }
  if (!y) { return false; }
  if (!x.constructor === Array) return false;
  if (!y.constructor === Array) return false;
  return x.some(r => y.includes(r));
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

function startReblogging(tags0, blacklist, blacklist_tags) {
  log("Listening to Steem Blockchain...")
  let history = new Set();
  steem.api.streamOperations((err, result) => {
    if (result && !err) {
      if (result[0] == 'comment') {
        let author1 = result[1]['author'];
        let permlink1 = result[1]['permlink'];
        let json_metadata = result[1]['json_metadata'];
        let parent_author = result[1]['parent_author'];
        let parent_permlink = result[1]['parent_permlink'];
        let post = "@" + author1 + "/" + permlink1;
        if (!history.has(post)) {
          history.add(post);        
          let tags = [];
          if (json_metadata) {
            tags = JSON.parse(json_metadata.trim());
            if (tags) {
              tags = tags.tags;
            }
          }
          if (parent_author===''&& (!permlink1.startsWith("re-")))  {
            if (arrayInArray(tags, tags0)) {
              if (blacklist.includes(author1)) {
                log("blacklist author: " + author1);
              } else if (arrayInArray(tags, blacklist_tags)) {
                log("blacklist tags");
              } else {
                log("resteem " + post);
                reblog(author1, permlink1);   
              }       
            }
          }                          
        }
      }    
    } else {
      log('steem.api.streamOperations: ' + err);
      history.clear();
      failover();
    }
  });
}

function failover() {
  if (config.rpc_nodes && config.rpc_nodes.length > 1) {
    let cur_node_index = config.rpc_nodes.indexOf(steem.api.options.url) + 1;

    if (cur_node_index == config.rpc_nodes.length)
      cur_node_index = 0;

    let rpc_node = config.rpc_nodes[cur_node_index];

    steem.api.setOptions({ transport: 'https', uri: rpc_node, url: rpc_node });
    log('');
    log('***********************************************');
    log('Failing over to: ' + rpc_node);
    log('***********************************************');
    log('');
  }
}
                
function log(msg) { 
  console.log(new Date().toString() + ' - ' + msg); 
}                          

function startProcess() {
  if (lock) {
    log('another thread already running...');
    return;
  }
  lock = true;
  try {
    startReblogging(config.tags, config.blacklist, config.blacklist_tags);
  } catch (err) {
    log(err.message);
  } finally {
    lock = false;
  }  
}
