/** ───── BECOME A DISCORD BOT ───── **/
const Discord = require('discord.js');
const logger = require('winston');
const auth = require('./auth.json');
const properties = require('./package.json');

const botVersion = "0.2.6";

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(logger.transports.Console, {
    colorize: true
});
logger.level = 'debug';

logger.info("Starting Entrapment Bot version " + botVersion);

// Initialize Discord Bot
const client = new Discord.Client();
client.login(auth.token);

// Once logged in
client.on('ready', () => {
    logger.info('Connected!');
	
	// Say it in bot feed
    client.guilds.array().forEach(guild => {
		if (guild.available) {
			let botFeedChannel = guild.channels.find('name', "bot-feed");
			if (botFeedChannel) {
				botFeedChannel.send("I'm online! Version: " + botVersion);
			}
		}
	});
});

client.on('disconnected', function() {
    logger.info("Disconnected from the server. Stopping!");
    process.exit();
});

/*
client.on('channelCreate', channel => {
	if (channel.name == "entrapment-bot") {
		channel.send("Tell me what I should do!");
	}
});
//*/

/** ───── MESSAGE PARSER ───── **/

const prefix = '!';

client.on('message', message => {logger.log('debug', message.content);
    if (message.author.bot) {
        return;
    }
    
    // Commands
    if (message.content.substring(0, 1) == prefix) {
        executeCommand(message, message.content.substring(1));
    }
    
    else if (message.content.toLowerCase().startsWith("good bot")) {
        message.channel.send("Thank you!");
    }
    else if (message.content.toLowerCase().startsWith("bad bot")) {
        message.channel.send(":(");
    }
});

function executeCommand(message, command) {
    try {
        // Split the command into its commandArguments and remove empty ones
        let commandArguments = command.trim().split(" ").filter(arg => arg.length > 0);
        
        // Store the command name separately
        let commandName = commandArguments.shift();
        
        // Invalid commands
        if (commandName.length <= 0) {
            return;
        }
        if (typeof commands[commandName] != "object") {
            throw {
                'isCommandError': true,
                'type': "commandNameInvalid"
            };
        }
        
        // See if there's an error
        let error = cannotExecuteCommand(message, commandName);
        if (error) {
            throw error;
        }
        
        // Execute the command and store its result
		let commandToExecute = commandName;
		if (typeof commands[commandName].alias == "string") {
			commandToExecute = commands[commandName].alias;
		}
		let commandResult = commands[commandToExecute].execute(message, commandArguments);
        
        // Result
		if (typeof commandResult == "object") {
			if (commandResult.success == true) {
				message.react('✅'); // :white_check_mark:
			}
			else if (commandResult.success == false) {
				message.react('❌'); // :x:
			}
			let returnText = "";
			if (typeof commandResult.type == "string" && typeof commandErrorTypes[commandResult.type] == "string") {
				returnText = commandErrorTypes[commandResult.type];
			}
			if (typeof commandResult.returnText == "string" && commandResult.returnText.length > 0) {
				if (returnText.length > 0) {
					returnText += ": "
				}
				returnText += commandResult.returnText;
			}
			if (returnText.length > 0) {
				message.channel.send(returnText);
			}
		}
        else if (typeof commandResult == "string" && commandResult.length > 0) {
            message.channel.send(commandResult);
        }
    }
    catch (error) {
		message.react('❌');
        if (typeof error == "object" && error.isCommandError) {
            let replyTxt = commandErrorTypes[error.type];
            if (error.extra) {
                replyTxt += ": " + error.extra;
            }
            else {
                replyTxt += ".";
            }
            message.channel.send(replyTxt);
        }
        else {
            logger.log('warn', error);
            message.channel.send("An unknown error occurred while evaluating your command.");
        }
    }
};

function cannotExecuteCommand(message, commandName) {
    // Assuming here that commandName is a valid command name
    
	if (typeof commands[commandName].alias == "string") {
		commandName = commands[commandName].alias;
	}
    let hasRoleMissing = commands[commandName].requiredRoles.length > 0 &&
                         commands[commandName].requiredRoles.some(role => !message.member.roles.exists('name', role));
    let hasWrongChannel = commands[commandName].permittedChannels.length > 0 && commands[commandName].permittedChannels.indexOf(message.channel.name) < 0;
    
    if (hasRoleMissing || hasWrongChannel) {
        if (commands[commandName].hidden) {
            return {
                'isCommandError': true,
                'type': "commandNameInvalid"
            }
        }
        return {
            'isCommandError': true,
            'type': "memberUnauthorised"
        };
    }
    
    return false;
};

var entrapmentIP = "JochCoolEntrapment.serv.nu";
var entrapmentVersion = "1.12.2";
var entrapmentGameRunning = false;
var entrapmentOnRealms = false;

//var tictactoegames = [];

const commandErrorTypes = {
    "commandNameInvalid": "Unknown command. Type `" + prefix + "help` for a list of commands",
    "memberUnauthorised": "You do not have permission to use this command",
    "commandNoChange": "Nothing changed",
    "argumentInvalid": "Invalid argument",
    "argumentMissing": "Missing argument"
};

// Contains properties of all commands
/*
(command) : {
    'permittedChannels' (array): list of the only channels (names) where this command may be used. If empty, it may be used in a all channels.
    'requiredRoles' (array): list of all roles (names) that the user needs to have to execute this command. If empty, anyone may use this command.
    'hidden' (bool) [WIP]: if true, the bot will act like this command doesn't exist unless you meet the requirements to execute it (channel and roles)
    'roles' (array): list of the only roles required to run this command. If empty, it may be used by anyone.
    'syntax' (string): the syntax as it is shown in the help command
    'description' (string): the description of the command as it is shown in the help command
    'execute' (function): the function that gets run to execute the command. Returns the success
}
*/

const commands = {
    'help': {
        'permittedChannels': [],
        'requiredRoles': [],
        'hidden': false,
        'syntax': "help",
        'description': "Shows a list of executable commands",
        'execute': function(message, commandArguments) {
            let returnText = "";
            for (var cmd in commands) {
                if (cannotExecuteCommand(message, cmd)) {
                    continue;
                }
				if (typeof commands[cmd].alias == "string") {
					returnText += "\n• `" + prefix + cmd + "` → `" + commands[cmd].alias + "`"
				}
				else {
					returnText += "\n• `" + prefix + commands[cmd].syntax + "` – " + commands[cmd].description;
				}
            }
            if (returnText == "") {
                return {"success": true, "returnText": "You cannot execute any commands!"}
            }
            return {"success": true, "returnText": "You can execute the following commands:" + returnText};
        }
    },
	'commander': {
        'permittedChannels': [],
        'requiredRoles': [],
        'hidden': false,
        'syntax': "commander",
        'description': "Toggles the commander role for you",
        'execute': function(message, commandArguments) {
            let roleCommander = message.guild.roles.find('name', "Commander");
            let playerIsCommander = message.member.roles.exists('name', "Commander");
            
            if (playerIsCommander) {
                message.member.removeRole(roleCommander, "Player used `!commander` command");
                return {"success": true, "returnText": "You are now a commander."};
            }
            else {
                message.member.addRole(roleCommander, "Player used `!commander` command");
                return {"success": true, "returnText": "You are no longer a commander."};
            }
        }
    },
    'active': {
        'permittedChannels': [],
        'requiredRoles': [],
        'hidden': false,
        'syntax': "active",
        'description': "Toggles between being active and inactive",
        'execute': function(message, commandArguments) {
            let roleActivePlayer = message.guild.roles.find('name', "Active Player");
            let playerIsActive = message.member.roles.exists('name', "Active Player");
            
            if (playerIsActive) {
                message.member.removeRole(roleActivePlayer, "Player used `!active` command");
                return {"success": true, "returnText": message.author.username + " is now inactive."};
            }
            else {
                message.member.addRole(roleActivePlayer, "Player used `!active` command");
                return {"success": true, "returnText": message.author.username + " is now active."};
            }
        }
    },
    'ip': {
        'permittedChannels': [],
        'requiredRoles': [],
        'hidden': false,
        'syntax': "ip",
        'description': "Returns the IP address of the current Entrapment server",
        'execute': function(message, commandArguments) {
			if (typeof entrapmentIP == 'string') {
				if (entrapmentOnRealms) {
					return "Entrapment is played on the Realm of " + entrapmentIP + ".";
				}
				return "The IP address is `" + entrapmentIP + "` (Minecraft version " + entrapmentVersion + ").";
			}
			if (entrapmentOnRealms) {
				return "Entrapment is played on Realms, but the owner of the Realm is unknown.";
			}
			return "The IP address of the server is unknown.";
		}
    },
    'team': {
        'permittedChannels': [],
        'requiredRoles': [],
        'hidden': false,
        'syntax': "team (blue|red|none)",
        'description': "Puts you in a team for Entrapment",
        'execute': function(message, commandArguments) {
            let roleTeamBlue = message.guild.roles.find('name', "Lapis Team");
            let roleTeamRed = message.guild.roles.find('name', "Redstone Team");
            let playerIsTeamBlue = message.member.roles.exists('name', "Lapis Team");
            let playerIsTeamRed = message.member.roles.exists('name', "Redstone Team");
            
            switch (commandArguments[0]) {
                case "lapis":
                case "blue":
                    if (playerIsTeamBlue) {
                        return {"success": false, "returnText": "You are already in team " + commandArguments[0] + "! Type `"+prefix+"team none` to leave this team."};
                    }
                    if (playerIsTeamRed) {
                        message.member.removeRole(roleTeamRed, "Player used `!team` command");
                    }
                    message.member.addRole(roleTeamBlue, "Player used `!team` command");
                    return {"success": true};
                case "redstone":
                case "red":
                    if (playerIsTeamRed) {
                        return {"success": false, "returnText": "You are already in team " + commandArguments[0] + "! Type `"+prefix+"team none` to leave this team."};
                    }
                    if (playerIsTeamBlue) {
                        message.member.removeRole(roleTeamBlue, "Player used `!team` command");
                    }
                    message.member.addRole(roleTeamRed, "Player used `!team` command");
                    return {"success": true};
                case "none":
                    if (playerIsTeamBlue) {
                        message.member.removeRole(roleTeamBlue, "Player used `!team` command");
                        return {"success": true};
                    }
                    if (playerIsTeamRed) {
                        message.member.removeRole(roleTeamRed, "Player used `!team` command");
                        return {"success": true};
                    }
                    return {"success": false, "returnText": "You aren't in a team anyways!"};
				default:
					if (typeof commandArguments[0] == "undefined") {
                        return {"success": false, "type": "argumentMissing", "returnText": "`(blue|red|none)`"};
                    }
                    return {"success": false, "type": "argumentInvalid", "returnText": "`" + commandArguments[0] + "`. Expected `blue`, `red` or `none`."};
            }
        }
    },
    'entrapment': {
        'permittedChannels': [],
        'requiredRoles': ["Mod"],
        'hidden': false,
        'syntax': "entrapment (start|stop|schedule|setip|setversion) ...",
        'description': "command WIP",
        'execute': function(message, commandArguments) {
            switch (commandArguments[0]) {
                case "start":
					if (entrapmentGameRunning) {
						return {"success": false, "returnText": "Entrapment Game has already started."};
					}
					entrapmentGameRunning = true;
					
					// Check any further arguments
					switch (commandArguments[1]) {
						case "server":
							entrapmentOnRealms = false;
							entrapmentIP = commandArguments[2];
							break;
						case "realm":
						case "realms":
							entrapmentOnRealms = true;
							entrapmentIP = commandArguments[2];
							break;
					}
					
					if (typeof entrapmentIP == 'string') {
						if (entrapmentOnRealms) {
							return {"success": true, "returnText": "An Entrapment Game has started on the Realm of " + entrapmentIP + "!"};
						}
						return {"success": true, "returnText": "An Entrapment Game has started! IP: `" + entrapmentIP + "`"};
                    }
					if (entrapmentOnRealms) {
						return {"success": true, "returnText": "An Entrapment Game has started on Realms!"};
					}
					return {"success": true, "returnText": "An Entrapment Game has started! The IP is not specified."}
					break;
				
				case "end":
                case "stop":
                    if (!entrapmentGameRunning) {
						return {"success": false, "returnText": "There is no game currently running."}
					}
					entrapmentGameRunning = false;
					if (message.guild.available) {
						let roleTeamBlue = message.guild.roles.find('name', "Lapis Team");
						let roleTeamRed = message.guild.roles.find('name', "Redstone Team");
						if (roleTeamBlue) {
							roleTeamBlue.members.array().forEach(member => {member.removeRole(roleTeamBlue, "The Entrapment game ended."); });
						}
						if (roleTeamRed) {
							roleTeamRed.members.array().forEach(member => {member.removeRole(roleTeamRed, "The Entrapment game ended."); });
						}
					}
					return {"success": true, "returnText": "The Entrapment Game has concluded! Thanks for playing!"};
                    break;
				
                case "setip":
                    if (typeof commandArguments[1] == 'string') {
                        entrapmentIP = commandArguments[1];
                        return {"success": true, "returnText": "The new IP address for the Entrapment server is `" + entrapmentIP + "`."};
                    }
					return {"success": false, "type": "argumentMissing", "returnText": "`<newIP>`"};
                    break;
				
				case "setversion":
					if (typeof commandArguments[1] == 'string') {
						entrapmentVersion = commandArguments[1];
						return {"success": true, "returnText": "Entrapment is now played on " + entrapmentVersion + "!"};
					}
					return {"success": false, "type": "argumentMissing", "returnText": "`<newVersion>`"}
				
                case "schedule":
                    return {"success": false, "returnText": "Scheduling games has not been implemented yet."};
                    break;
				
                default:
                    if (typeof commandArguments[0] == "undefined") {
                        return {"success": false, "type": "argumentMissing", "returnText": "`(start|stop|schedule|setip)`"};
                    }
                    return {"success": false, "type": "argumentInvalid", "returnText": "`" + commandArguments[0] + "`. Expected `start`, `stop`, `schedule` or `setip`."};
            }
        }
    },
    'ent': {
        'alias': 'entrapment'
    },
    'ping': {
        'permittedChannels': [],
        'requiredRoles': ["Mod"],
        'hidden': false,
        'syntax': "ping",
        'description': "What would it say?",
        'execute': function(message, commandArguments) {
            return {"success": true, "returnText": "pong"};
        }
    },
	/*
	'tictactoe': {
		'permittedChannels': [],
		'requiredRoles': [],
		'hidden': false,
		'syntax': "tictactoe (challenge|accept|deny|move) ...",
		'description': "Play tic tac toe with someone! (Command WIP)",
		'execute': function(message, commandArguments) {
			switch (commandArguments[0]) {
				case "challenge":
					if (typeof commandArguments[1] == "undefined") {
						return {"success": false, "type": "argumentMissing", "returnText": "`<user>`"}
					}
					if (!commandArguments[1].startsWith("<@")) {
						return {"success": false, "type": "invalidArgument", "returnText": "`" + commandArguments[1] + "`. Expected a user mention."}
					}
					//message.guild.members[
					break;
				case "accept":
					break;
				case "deny":
					break;
				case "move":
					break;
				default:
					if (typeof commandArguments[0] == "undefined") {
						return {"success": false, "type": "argumentMissing", "returnText": "`(challenge|accept|deny|move)`"};
					}
					return {"success": false, "type": "invalidArgument", "returnText": "`" + commandArguments[0] + "`. Expected `challenge`, `accept`, `deny` or `move`."};
			}
		}
	},
	*/
    'stop': {
        'permittedChannels': ["bot-feed"],
        'requiredRoles': ["Mod"],
        'hidden': true,
        'syntax': "stop",
        'description': "Stops the bot",
        'execute': function(message, commandArguments) {
            logger.info("Stopping!");
            client.setInterval(client.destroy, 1000);
            return {"success": true};
        }
    },
    /*
    'impossible': {
        'permittedChannels': [],
        'requiredRoles': ["thisroledoesnotexist"],
        'hidden': true,
        'syntax': "impossible",
        'description': "You can't execute this command",
        'execute': function(message, commandArguments) {
            return {"success": true, "returnText": "You've done the impossible!"};
        }
    }
    */
};
