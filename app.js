var issue_label, sender_name, repository_name, commit_name, commit_email;

var sys = require('sys'),
    hexo_init = require('hexo').init,
    async = require('async'),
    child_process = require('child_process'),
    exec = child_process.exec,
    spawn = child_process.spawn;

var app = require('express')();
var bodyParser = require('body-parser');
var port = Number(process.env.PORT || 4000);
var isBuilding = false;

app.use(bodyParser.json());
app.get('/', function(req, res){
            sys.puts('ignore get method');
            res.send('success');
        });

app.post('/', function(req, res){
            sys.puts('post method');
            var data = req.body;
            if(isValidData(data)){
                output(res, 'building');
                build(res);
            }else{
                output(res, 'not valid post data');
                output.end();
            }
         });

function isValidData(data){
    if(data.issue &&
       data.repository &&
       data.repository.name &&
       data.repository.name == repository_name){
        if(!sender_name || (
           data.sender &&
           data.sender.login &&
           data.sender.login == sender_name)){
            if(data.action){
                var action = data.action;
                if(action == 'labeled' || action == 'unlabeled'){
                    if(!issue_label){
                        return true;
                    }
                    if(data.label && data.label.name && data.label.name == issue_label){
                        return true;
                    }
                }
                if(action == 'opened' || action == 'reopened' || action == 'closed'){
                    if(!issue_label){
                        return true;
                    }
                    var labels = data.issue.labels;
                    if(labels){
                        for(var i = 0; i < labels.length; i++){
                            if(labels[i] && labels[i].name && labels[i].name == issue_label){
                                return true;
                            }
                        }
                    }
                }
            }
        }
        
    }
    return false;
}

function build(res){
    if(isBuilding){
        output(res, 'Hexo is currently building, not gonna build again.');
        res.end();
        return;
    }
    isBuilding = true;
    sys.puts('begin buiding');
    configureGit(res, function(){
                 var commands = [
                            ['clean'],
                            ['migrate', 'issue'],
                            ['deploy', '-g'],
                            ['clean']
                        ];
                 async.eachSeries(commands, function(item, next){
                                  run('hexo', item, res, function(error){
                                      if(error){
                                      isBuilding = false;
                                      output(res, 'error: ' + error + ' command: hexo ' + item.join(' '));
                                      res.statusCode = 500;
                                      res.end();
                                      }else{
                                      next();
                                      }
                                      });
                                  }, function(){
                                  isBuilding = false;
                                  output(res, 'ready for another deploy');
                                  res.end();
                                  });
        
                 });
}

function output(res, content){
    sys.puts(content);
    if(res){
        res.write(content);
    }
}

function configureGit(res, callback){
    var commands = [];
    if(commit_name){
        commands.push('git config --global user.name ' + commit_name);
    }
    if(commit_email){
        commands.push('git config --global user.email ' + commit_email);
    }
    commands.push('eval "$(ssh-agent -s)"');
    commands.push('ssh-add .ssh/id_rsa');
    async.eachSeries(commands, function(command, next){
                     exec(command, function(error, stdout, stderr){
                          if(error){
                            output(res, 'configure git error: ' + error + '\n' + stderr);
                            if(res){
                                res.statusCode = 500;
                                res.end();
                            }
                            isBuilding = false;
                          }else{
                            next();
                          }
                          });
                     }, function(error){
                        if(error){
                            output(res, 'configure git error: ' + error + '\n' + stderr);
                            if(res){
                                res.statusCode = 500;
                                res.end();
                            }
                            isBuilding = false;
                        }else{
                            callback(error);
                        }
                     });
}

var run = function(command, args, res, callback){
    var cp = spawn(command, args, {});
    
    cp.stdout.on('data', function(data){
                 output(res, data);
                 });
    
    cp.stderr.on('data', function(data){
                 output(res, data);
                 });
    
    cp.on('close', callback);
};

hexo_init({command: 'version'}, function(){
            if(hexo && hexo.config){
                var issue_migrator = hexo.config.issue_migrator;
                var heroku_auto_publisher = hexo.config.heroku_auto_publisher;
                var owner_name;
                if(issue_migrator){
                    issue_label = issue_migrator.label;
                    repository_name = issue_migrator.repository_name;
                    owner_name = issue_migrator.owner_name;
                }
                if(heroku_auto_publisher){
                    sender_name = heroku_auto_publisher.sender_name;
                    commit_name = heroku_auto_publisher.commit_user_name;
                    commit_email = heroku_auto_publisher.commit_user_email;
                }
                if(owner_name && repository_name){
                    app.listen(port, function(){
                               isBuilding = false;
                               sys.puts("listening to : " + port);
                               build(null);
                               });
                }else{
                    sys.puts('lack of config\nCheck details at:\n   http://emptyzone.github.io');
                }
            }
          });
