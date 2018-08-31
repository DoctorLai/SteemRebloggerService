'use strict';

const fs = require("fs");
const steem = require('steem');

const CONFIG_FILE = "config.json";

var config = JSON.parse(fs.readFileSync(CONFIG_FILE));

// Connect to the specified RPC node
var rpc_node = config.rpc_nodes ? config.rpc_nodes[0] : (config.rpc_node ? config.rpc_node : 'https://api.steemit.com');
steem.api.setOptions({ transport: 'https', uri: rpc_node, url: rpc_node });

// run immediately
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
        voting_post(author1, permlink1, config.voting_percentage);
      } else {
        log("reblog(): " + err);
      }
  });  
}

// voting
const voting_post = (account, permlink, weight) => {
  /* @params username, password, author, permlink, weight */
  if (weight <= 0) return;
  steem.broadcast.vote(config.posting_key, config.account, account, permlink, weight, function(err, result) {
    if (result && !err) {
      log("voted on " + account + "/" + permlink);
      if (config.comment !== "") {
        post_and_upvote_comment(account, permlink, config.comment);
      }
    } else {
      log("voting_post(): " + err);
    }
  });   
}

// post a comment
const post_and_upvote_comment = (parent_author, parent_permlink, body) => {
  /** Broadcast a comment */
  let permlink = new Date().toISOString().replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
  steem.broadcast.comment(
    config.posting_key,
    parent_author,
    parent_permlink,
    config.account, // Author
    permlink, // Permlink
    '', // Title
    body, 
    { tags: ['ilovecoding'], app: 'ilovecoding' }, // Json Metadata
    function(err, result) {
      if (result && !err) {
        log("commented!");
        voting_post(config.account, permlink, 500);
      } else {
        log(err);
      } 
    }
  );
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
  history.clear();
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
  const ts = new Date().toString();  
  console.log(ts + ' - ' + msg); 
}                          

function startProcess() {
  try {
    startReblogging(config.tags, config.blacklist, config.blacklist_tags);
  } catch (err) {
    log(err.message);
  } finally {
  }  
}
