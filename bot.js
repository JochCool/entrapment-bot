const botVersion = "0.4.0";
console.log("Starting Entrapment Bot version " + botVersion);

/** ───── BECOME A DISCORD BOT ───── **/

// Require and read some things
const Discord = require('discord.js');
const auth = require('./auth.json');
const properties = require('./package.json');
const fs = require('fs');
var emojiNames = require('./emojinames.json');
var gameSessions = require('./gamesessions.json');

console.log("Requirements done");
if (properties.version != botVersion) {
	console.log("Inconsistency between package version (" + properties.version + ") and code version (" + botVersion + ")");
}

// Initialize Discord Bot
const client = new Discord.Client();
client.login(auth.token);

// Once logged in
client.on('ready', () => {
	console.log('Connected!');
	
	// Say it in bot feed
	client.guilds.array().forEach(guild => {
		if (guild.available) {
			let botFeedChannel = guild.channels.find('name', "bot-feed");
			if (botFeedChannel) {
				botFeedChannel.send("I'm online! Version: " + botVersion);
			}
			else {
				console.log("Couldn't find channel bot-feed of guild " + guild.name + " (ID: " + guild.id + ")")
			}
		}
	});
	
	client.user.setActivity("you", {type: "LISTENING"});
});

client.on('disconnected', function() {
	console.log("Disconnected from the server. Stopping!");
	process.exit();
});

/** ───── MESSAGE PARSER ───── **/

const prefix = '!';

client.on('message', message => {
	
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

function CommandResult(success, replyText) {
	this.success = success;
	this.replyText = replyText;
};

CommandResult.prototype.evaluate = function(message) {
	if (!message) {
		console.log("WARNING: MESSAGE OBJECT WAS NOT PASSED INTO THE EVALUATE METHOD OF " + this);
		return;
	}
	if (this.success == true) {
		message.react('✅'); // :white_check_mark:
	}
	else if (this.success == false) {
		message.react('❌'); // :x:
	}
	if (typeof this.replyText == "string" && this.replyText.length > 0) {
		message.channel.send(this.replyText).catch(console.log);
	}
};

var input = null, thisInputEnd = -1;

function executeCommand(message, command) {
	try {
		console.log("Executing command: "+command);
		
		// determine op level
		let userOpLevel = 0;
		if (message.channel.type == "text" && message.guild) {
			userOpLevel = 1;
			if (message.guild.available) {
				if (message.guild.ownerID == message.member.id) {
					userOpLevel = 4;
				}
				else if (message.member.roles.exists("name", "Mod")) {
					userOpLevel = 3;
				}
				else if (message.member.roles.exists("name", "Active Player")) {
					userOpLevel = 2;
				}
			}
		}
		
		// init
		let currentArgument = commands;
		let inputs = {};
		
		// loop through arguments to run the command
		while (currentArgument.child) {
			let syntax = currentArgument.getChildSyntax();
			currentArgument = currentArgument.child;
			
			// type check
			command = command.trim();
			input = null;
			thisInputEnd = -1;
			let inputAllowed = false;
			if (Array.isArray(currentArgument)) {
				for (var a = 0; a < currentArgument.length; a++) {
					if (currentArgument[a].isInputAllowed(command)) {
						currentArgument = currentArgument[a];
						inputAllowed = true;
						break;
					}
				}
			}
			else {
				inputAllowed = currentArgument.isInputAllowed(command);
			}
			
			if (!inputAllowed) {
				if (currentArgument == commands.child) {
					throw new CommandResult(false, "Unknown command. Type `" + prefix + "help` for a list of commands");
				}
				else {
					throw new CommandResult(false, "Invalid argument: `" + input + "`. Expected `" + syntax + "`.");
				}
			}
			
			// check permission
			if (currentArgument.oplevel >= 1 && message.guild && !message.guild.available) {
				throw new CommandResult(false, "It looks like the guild you're in is not available. Please contact a moderator for help.");
			}
			if (currentArgument.oplevel > userOpLevel) {
				if (currentArgument.oplevel == 1) {
					throw new CommandResult(false, "You can only run this command on a server.");
				}
				throw new CommandResult(false, "You do not have permission to use this command");
			}
			
			// add input to inputs list
			inputs[currentArgument.name] = input;
			
			// continue
			if (thisInputEnd >= 0) {
				command = command.substring(thisInputEnd);
			}
			// last input; run the command
			else {
				console.log("running command at argument " + currentArgument.name);
				if (!currentArgument.run) {
					throw new CommandResult(false, "Missing argument: `" + currentArgument.getChildSyntax() + "`");
				}
				let commandResult = currentArgument.run(message, inputs, userOpLevel);
				if (typeof commandResult == "object" && commandResult instanceof CommandResult) {
					commandResult.evaluate(message);
				}
				else if (typeof commandResult == "string" && commandResult.length > 0) {
					message.channel.send(commandResult);
				}
				break;
			}
		}
	}
	catch (err) {
		if (typeof err == "object" && err instanceof CommandResult) {
			err.evaluate(message);
		}
		else {
			console.log(err);
			let unknownResult = new CommandResult(false, "An unknown error occurred while evaluating your command.");
			unknownResult.evaluate(message);
		}
	}
};

function startGameSession(message, options) {
	let newSession = {
		"id": gameSessions.games.length,
		"concluded": false,
		"channelIDs": {},
		"creatorId": message.author.id,
		"guildId": message.guild.id,
		"creatorUserName": message.author.username,
		"serverType": options.server || options.realm || "unknown",
		"serverName": options.address || options["owner of realm"] || "unknown",
		"serverVersion": options["minecraft version"] || "unknown",
		"gameName": options["name of game"] || "Entrapment"
	};
	
	// Sends confirmation message and stuff once all channels have been created.
	function finishSessionCreation() {
		if (newSession.channelIDs.category && newSession.channelIDs.text && newSession.channelIDs.voiceGeneral && newSession.channelIDs.voiceBlue && newSession.channelIDs.voiceRed) {
			
			// Open up the associated game channels
			for (var c in newSession.channelIDs) {
				message.guild.channels.get(newSession.channelIDs[c]).overwritePermissions(message.guild.id, { "VIEW_CHANNEL": true }).catch(console.log);
			}
			
			// Generate & send welcome message
			let welcomeMessage = "A new game of " + newSession.gameName + " has been created by " + message.author + ".\n";
			welcomeMessage += (newSession.serverType == "server") ? (newSession.serverName == "unknown") ? "Server IP is unknown." : "Server address: `" + newSession.serverName + "` (Minecraft version: " + newSession.serverVersion + ")" : (newSession.serverType == "realm") ? "Realm owner: " + newSession.serverName : "The server where the game is going to be played is unknown.";
			let gameTextChannel = message.guild.channels.get(newSession.channelIDs.text);
			gameTextChannel.send(welcomeMessage + "\nUse `" + prefix + "game setserver` to change where the game is going to be placed.\nUse `" + prefix + "game stop` to stop this game.");
			
			// Add the host role to the creator of the session
			let gameHostRole = message.guild.roles.find("name", "Game Host");
			if (gameHostRole) {
				message.member.addRole(gameHostRole, "This member became the host of game #" + newSession.id).catch(console.log);
			}
			
			// Send result
			let result = new CommandResult(true, "Your game has been set up! See " + gameTextChannel + ".");
			result.evaluate(message);
			
			// Save game session
			gameSessions.games.push(newSession);
			fs.writeFile("gamesessions.json", JSON.stringify(gameSessions, null, 4), (err) => {
				if (err) {
					console.log(err);
					message.channel.send("Something went wrong while saving your game. Please contact a moderator.").catch(console.log);
				}
			});
		}
	};
	
	// Create category for the game
	message.guild.createChannel("🔵 Playing " + newSession.gameName + "!", "category", [
		{
			"id": message.guild.id,
			"deny": ["VIEW_CHANNEL"]
		}
	], "User " + message.author.username + " started a game of " + newSession.gameName + " (id " + newSession.id + ").").then(
		
		gameCategory => {
			console.log("Created new game category");
			newSession.channelIDs.category = gameCategory.id;
			
			// Move to correct position
			gameCategory.setPosition(2).catch(err => { console.log("Error while setting the position of the new game category: " + err); });
			
			// Create game channel
			gameCategory.guild.createChannel("game-" + newSession.id, "text", [
				{
					"id": message.guild.id,
					"deny": ["VIEW_CHANNEL"]
				}
			], "Setting up game " + newSession.id).then(
				
				gameTextChannel => {
					newSession.channelIDs.text = gameTextChannel.id;
					gameTextChannel.setParent(gameCategory, "Setting up game " + newSession.id).catch(console.log);
					gameTextChannel.setTopic("Talk about your game of " + newSession.gameName + " here!").catch(console.log);
					finishSessionCreation();
				},
				err => {
					console.log("Error while creating the text channel for the new game: " + err);
					let result = new CommandResult(false, "Something went wrong while creating the game channels. Please contact a moderator for help.");
					result.evaluate(message);
				}
			);
			
			// Create voice channels
			gameCategory.guild.createChannel("Game General", "voice", [
				{
					"id": message.guild.id,
					"deny": ["VIEW_CHANNEL"]
				}
			], "Setting up game " + newSession.id).then(
				gameVoiceChannel => {
					newSession.channelIDs.voiceGeneral = gameVoiceChannel.id;
					gameVoiceChannel.setParent(gameCategory, "Setting up game " + newSession.id).catch(console.log);
					finishSessionCreation();
				},
				err => {
					console.log("Error while creating the general voice channel for the new game: " + err);
					let result = new CommandResult(false, "Something went wrong while creating the game channels. Please contact a moderator for help.");
					result.evaluate(message);
				}
			);
			gameCategory.guild.createChannel("Game Team Blue", "voice", [
				{
					"id": message.guild.id,
					"deny": ["VIEW_CHANNEL"]
				},
				{
					"id": message.guild.roles.find("name", "Team Red"),
					"deny": ["CONNECT", "SPEAK"]
				}
			], "Setting up game " + newSession.id).then(
				gameVoiceChannel => {
					newSession.channelIDs.voiceBlue = gameVoiceChannel.id;
					gameVoiceChannel.setParent(gameCategory, "Setting up game " + newSession.id).catch(console.log);
					finishSessionCreation();
				},
				err => {
					console.log("Error while creating the team blue voice channel for the new game: " + err);
					let result = new CommandResult(false, "Something went wrong while creating the game channels. Please contact a moderator for help.");
					result.evaluate(message);
				}
			);
			gameCategory.guild.createChannel("Game Team Red", "voice", [
				{
					"id": message.guild.id,
					"deny": ["VIEW_CHANNEL"]
				},
				{
					"id": message.guild.roles.find("name", "Team Blue"),
					"deny": ["CONNECT", "SPEAK"]
				}
			], "Setting up game " + newSession.id).then(
				gameVoiceChannel => {
					newSession.channelIDs.voiceRed = gameVoiceChannel.id;
					gameVoiceChannel.setParent(gameCategory, "Setting up game " + newSession.id).catch(console.log);
					finishSessionCreation();
				},
				err => {
					console.log("Error while creating the team red channel for the new game: " + err);
					let result = new CommandResult(false, "Something went wrong while creating the game channels. Please contact a moderator for help.");
					result.evaluate(message);
				}
			);
		},
		err => {
			console.log("Error while creating category for new game: " + err);
			let result = new CommandResult(false, "Something went wrong while creating the game channels. Please contact a moderator for help.");
			result.evaluate(message);
		}
	);
	
	return new CommandResult(null, "Starting the game...");
};

// Finds the game that this channel is part of
function findGameSession(channel) {
	for (var g = 0; g < gameSessions.games.length; g++) {
		if (gameSessions.games[g].channelIDs.category == channel.parentID) {
			return gameSessions.games[g];
		}
	}
	return null;
};

// `!game setserver` and `!game setname` commands
function changeGameSession(message, inputs, userOpLevel) {
	
	// Find game
	let game = findGameSession(message.channel);
	if (!game) {
		return new CommandResult(false, "You can only execute this command in a game channel.");
	}
	if (message.author.id != game.creatorId && userOpLevel < 3) {
		return new CommandResult(false, "Only the creator of this game or a moderator can change the game's address.");
	}
	
	// Change stuff
	let somethingChanged = false;
	
	if (inputs["new name"] && inputs["new name"] != game.gameName) {
		if (inputs["new name"].length > 89) {
			return new CommandResult(false, "That name is way too long! Please keep it under 90 characters.");
		}
		game.gameName = inputs["new name"];
		message.guild.channels.get(game.channelIDs.category).setName("🔵 Playing " + game.gameName + "!", "User " + message.author.username + " changed the name of the game.").catch(console.log);
		somethingChanged = true;
	}
	
	inputs.serverType = inputs.server || inputs.realm;
	if (inputs.serverType && inputs.serverType != game.serverType) {
		game.serverType = inputs.serverType;
		somethingChanged = true;
	}
	
	inputs.serverName = inputs.address || inputs["owner of realm"];
	if (inputs.serverName && inputs.serverName != game.serverName) {
		game.serverName = inputs.serverName;
		somethingChanged = true;
	}
	
	if (inputs["minecraft version"] && inputs["minecraft version"] != game.serverVersion) {
		game.serverVersion = inputs["minecraft version"];
		somethingChanged = true;
	}
	
	// Save & return
	if (somethingChanged) {
		fs.writeFile("gamesessions.json", JSON.stringify(gameSessions, null, 4), err => {
			if (err) {
				console.log(err);
				message.channel.send("Something went wrong while saving your game. Please contact a moderator.").catch(console.log);
			}
		});
		return new CommandResult(true, "The game settings have been updated.");
	}
	
	return new CommandResult(false, "Nothing changed.");
};

/*
The commands object stores the syntax and function of all of the bot's commands, as a tree of arguments.

An argument is represented by either a CommandArgument object, or an array of CommandArgument objects.
If it is an array, you can use any of the arguments in the list as the argument of your command (like an OR-list of possible inputs).

Each CommandArgument object has a name, which is what displays as a one-word description of the argument in the syntax.
Within one branch of the command tree, there should NEVER be multiple arguments with the same name!

There are various types of arguments:
- "literal" (you have to copy the name exactly)
- "text" (you can fill in whatever text you want)
- "number" (you have to fill in a valid number)
- "root" (not an argument, this is the first node in the tree)

Each argument also has an op level, which is a number specifying the requirement to run this command.
- 0: anyone can execute this command anywhere.
- 1: this command can only be executed in a guild.
- 2: only active players can execute this command.
- 3: only moderators can execute this command.
- 4: only the owner of the guild can execute this command.

Some arguments have a run function. This function gets executed if this argument was the last one to be specified in the command.
If instead of a function, there is null, that means that the child of this argument is not optional. This child then must ALWAYS exist.
If the function does exist, then that means that all child arguments are optional.
The arguments that get passed into this function are:
- Message, the Discord message that triggered this command.
- Object, lists the inputs of the user, with the keys being the name of the argument that was the user input.
- Number, the calculated OP level of the user.
*/

function CommandArgument(type, name, oplevel, runFunction, child) {
	this.type = type;
	this.name = name;
	this.oplevel = oplevel;
	this.run = runFunction;
	this.child = child;
};

// Returns whether or not the first input in the command string is a valid input for this argument
CommandArgument.prototype.isInputAllowed = function(command) {
	if (command == "") {
		return false;
	}
	input = command;
	if (this.child) {
		thisInputEnd = command.indexOf(" ");
		if (thisInputEnd >= 0) {
			input = command.substring(0, thisInputEnd);
		}
	}
	if (this.type == "number") {
		input = Number(input);
		return !isNaN(input);
	}
	return this.type == "text" || this.type == "literal" && input == this.name;
};

// Returns the syntaxt of this argument's child, properly formatted.
CommandArgument.prototype.getChildSyntax = function(withChildren) {
	if (typeof this.child != "object") {
		return "";
	}
	let syntax = "";
	let childrenHaveChildren = false;
	if (Array.isArray(this.child)) {
		syntax += "(";
		for (var i = 0; i < this.child.length; i++) {
			if (i > 0) {
				syntax += "|";
			}
			if (this.child[i].type == "literal") {
				syntax += this.child[i].name;
			}
			else {
				syntax += "<" + this.child[i].name + ">";
			}
			if (this.child[i].child) {
				childrenHaveChildren = true;
			}
		}
		syntax += ")";
	}
	else {
		if (this.child.type == "literal") {
			syntax += this.child.name;
		}
		else {
			syntax += "<" + this.child.name + ">";
		}
	}
	if (this.run) {
		syntax = "[" + syntax + "]";
	}
	if (withChildren) {
		if (Array.isArray(this.child)) {
			if (childrenHaveChildren) {
				syntax += " ...";
			}
		}
		else {
			syntax += " " + this.child.getChildSyntax(true);
		}
	}
	return syntax.trim();
};

// Returns an array of all possible child syntaxes (including the childs of the childs)
CommandArgument.prototype.getAllChildSyntaxes = function() {
	if (!this.child) {
		return [""];
	}
	let syntaxes = [];
	if (Array.isArray(this.child)) {
		for (var i = 0; i < this.child.length; i++) {
			let thesesyntaxes = this.child[i].getAllChildSyntaxes();
			let childName = this.child[i].name;
			if (this.child[i].type != "literal") {
				childName = "<" + childName + ">";
			}
			if (this.run) {
				childName = "[" + childName + "]";
			}
			for (var s = 0; s < thesesyntaxes.length; s++) {
				syntaxes.push(childName + " " + thesesyntaxes[s]);
			}
		}
	}
	else {
		syntaxes = this.child.getAllChildSyntaxes();
		let childName = this.child.name;
		if (this.child.type != "literal") {
			childName = "<" + childName + ">";
		}
		if (this.run) {
			childName = "[" + childName + "]";
		}
		for (var s = 0; s < syntaxes.length; s++) {
			syntaxes[s] = childName + " " + syntaxes[s];
		}
	}
	return syntaxes;
};

// The big commands object
const commands = new CommandArgument("root", prefix, 0, null, [
	new CommandArgument("literal", "help", 0, function(message, inputs, userOpLevel) {
		let returnTxt = "";
		for (var i = 0; i < commands.child.length; i++) {
			if (userOpLevel >= commands.child[i].oplevel) {
				returnTxt += "\n• `" + prefix + commands.child[i].name + " " + commands.child[i].getChildSyntax(true) + "`";
			}
		}
		if (returnTxt == "") {
			return new CommandResult(false, "You cannot execute any commands!");
		}
		return new CommandResult(true, "You can execute the following commands:" + returnTxt);
	},
		new CommandArgument("text", "command", 0, function(message, inputs, userOpLevel) {
			let cmd = commands.child.find(arg => arg.name == inputs.command);
			if (cmd) {
				if (userOpLevel < cmd.oplevel) {
					return new CommandResult(false, "You do not have permission to use this command");
				}
				let returnTxt = "", syntaxes = cmd.getAllChildSyntaxes();
				for (var s = 0; s < syntaxes.length; s++) {
					returnTxt += "\n" + prefix + inputs.command + " " + syntaxes[s];
				}
				return new CommandResult(true, "Syntax:\n```" + returnTxt + "\n```");
			}
			return new CommandResult(false, "The command `"+inputs.command+"` does not exist.");
		})
	),
	new CommandArgument("literal", "active", 1, function(message) {
		let roleActivePlayer = message.guild.roles.find('name', "Active Player");
		
		if (message.member.roles.exists('name', "Active Player")) {
			message.member.removeRole(roleActivePlayer, "Player used `!active` command");
			return new CommandResult(true, message.author.username + " is now inactive.");
		}
		else {
			message.member.addRole(roleActivePlayer, "Player used `!active` command");
			return new CommandResult(true, message.author.username + " is now active.");
		}
	}),
	new CommandArgument("literal", "emoji", 1, null, [
		new CommandArgument("literal", "update", 1, function(message) {
			if (typeof emojiNames[message.author.id] == "undefined") {
				return new CommandResult(false, "You don't have an emoji yet! Play a game of Entrapment and ask a moderator to add your emoji as a reward for playing along.");
			}
			let emojiToUpdate = message.guild.emojis.find('name', emojiNames[message.author.id]);
			if (!emojiToUpdate) {
				return new CommandResult(false, "Your emoji appears to not exist. Please contact a moderator if you think this is an error.");
			}
			
			// Try to upload the emoji
			message.guild.createEmoji(message.author.displayAvatarURL, emojiNames[message.author.id], null, message.author.username + " used `!emoji update` command").then(
				
				// if success, try to delete the prev emoji
				createdEmoji => {
					message.guild.deleteEmoji(emojiToUpdate, message.author.username + " used `!emoji update` command").then(
					
						() => {
							message.react(createdEmoji);
							let result = new CommandResult(true, "Your emoji has been updated.");
							result.evaluate(message);
						},
						
						error => {
							console.log("Error while deleting the emoji of " + message.username + ": " + error);
							let result = new CommandResult(false, "Something went wrong while removing your old emoji. Please contact a moderator for support.");
							result.evaluate(message);
						}
					);
				},
				
				error => {
					console.log("Error while uploading the emoji of " + message.username + ": " + error);
					let result = new CommandResult(false, "Failed to update your emoji. A likely cause is that your profile picture is too powerful. Please contact a moderator for support.");
					result.evaluate(message);
				}
			);
			return new CommandResult(null, "Updating your emoji...");
		}),
		new CommandArgument("literal", "setname", 1, null,
			new CommandArgument("text", "newName", 1, function(message, inputs) {
				if (typeof emojiNames[message.author.id] == "undefined") {
					return new CommandResult(false, "You don't have an emoji yet! Play a game of Entrapment and ask a moderator to add your emoji as a reward for playing along.");
				}
				if (inputs.newName == emojiNames[message.author.id]) {
					return new CommandResult(false, "Your emoji already has that name!");
				}
				if (message.guild.emojis.find('name', inputs.newName)) {
					return new CommandResult(false, "There is already an emoji with that name!");
				}
				let emojiToRename = message.guild.emojis.find('name', emojiNames[message.author.id]);
				if (!emojiToRename) {
					return new CommandResult(false, "Your emoji appears to not exist. Please contact a moderator if you think this is an error.");
				}
				emojiToRename.setName(inputs.newName, message.author.username + " used `!emoji setname` command.").then(
					changedEmoji => {
						emojiNames[message.author.id] = inputs.newName;
						fs.writeFile('emojinames.json', JSON.stringify(emojiNames, null, 4), (err) => {
							let result = null;
							if (err) {
								console.log("Error while saving the new name of emoji " + emojiToRename  + ": " + err);
								result = new CommandResult(false, "An unexpected error occurred while changing the name of your emoji. Please contact a moderator for help.");
							}
							else {
								message.react(emojiToRename);
								result = new CommandResult(true, "The name of your emoji has been changed to `:" + emojiNames[message.author.id] + ":`.");
							}
							result.evaluate(message);
						});
					},
					
					error => {
						console.log("Error while changing the name of emoji " + emojiToRename  + " to " + inputs.newName + ": " + error);
						let result = new CommandResult(false, "An unexpected error occurred while changing the name of your emoji. Please contact a moderator for help.");
						result.evaluate(message);
					}
				);
				return new CommandResult(null, "Changing the name of your emoji...");
			})
		)
	]),
	new CommandArgument("literal", "game", 1, null, [
		new CommandArgument("literal", "start", 2, startGameSession, [
			new CommandArgument("literal", "server", 2, startGameSession,
				new CommandArgument("text", "address", 2, startGameSession,
					new CommandArgument("text", "minecraft version", 2, startGameSession,
						new CommandArgument("text", "name of game", 2, startGameSession)
					)
				)
			),
			new CommandArgument("literal", "realm", 2, startGameSession,
				new CommandArgument("text", "owner of realm", 2, startGameSession,
					new CommandArgument("text", "name of game", 2, startGameSession)
				)
			)
		]),
		new CommandArgument("literal", "setserver", 1, null, [
			new CommandArgument("literal", "server", 1, null,
				new CommandArgument("text", "address", 1, changeGameSession,
					new CommandArgument("text", "minecraft version", 1, changeGameSession)
				)
			),
			new CommandArgument("literal", "realm", 1, null,
				new CommandArgument("text", "owner of realm", 1, changeGameSession)
			)
		]),
		new CommandArgument("literal", "setname", 1, null,
			new CommandArgument("text", "new name", 1, changeGameSession)
		),
		new CommandArgument("literal", "list", 1, function(message) {
			let returnTxt = "";
			gameSessions.games.forEach(game => {
				if (!game.concluded) {
					returnTxt += "\n• Game #" + game.id + ": " + game.gameName + " (created by " + game.creatorUserName + ").";
				}
			});
			if (returnTxt == "") {
				return "There are not games currently running. Type `" + prefix + "game start` to start a game.";
			}
			return "The following games are currently running:" + returnTxt;
		}),
		new CommandArgument("literal", "stop", 1, function(message) {
			let game = findGameSession(message.channel);
			console.log("Stopping game: " + game);
			if (!game) {
				return new CommandResult(false, "Games can only be stopped in their text channels.");
			}
			if (message.author.id != game.creatorId && userOpLevel < 3) {
				return new CommandResult(false, "Only the creator of this game or a moderator can stop the game.");
			}
			if (game.concluded) {
				return new CommandResult(false, "This game has already been concluded!");
			}
			
			console.log("Stopping game " + game.id);
			game.concluded = true;
			fs.writeFile("gamesessions.json", JSON.stringify(gameSessions, null, 4), err => { if (err) { console.log(err); } });
			
			// Remove voice channels
			message.guild.channels.get(game.channelIDs.voiceGeneral).delete("User " + message.author.username + " stopped the game.").catch(console.log);
			message.guild.channels.get(game.channelIDs.voiceBlue).delete("User " + message.author.username + " stopped the game.").catch(console.log);
			message.guild.channels.get(game.channelIDs.voiceRed).delete("User " + message.author.username + " stopped the game.").catch(console.log);
			
			// Archive text channel
			let gameTextChannel = message.guild.channels.get(game.channelIDs.text);
			gameTextChannel.overwritePermissions(message.guild.id, { "VIEW_CHANNEL": false }, "User " + message.author.username + " stopped the game.").then(
				() => {
					gameTextChannel.setParent(message.guild.channels.find(channel => channel.name == "Game archives" && channel.type == "category"), "User " + message.author.username + " stopped the game.").catch(console.log);
					
					message.guild.channels.get(game.channelIDs.category).delete("User " + message.author.username + " stopped the game.").catch(console.log);
					
					if (message.member.roles.exists("name", "Game Host")) {
						let gameOwnerShouldLoseRole = true;
						for (var g = 0; g < gameSessions.games.length; g++) {
							if (gameSessions.games[g].creatorId == message.author.id) {
								gameOwnerShouldLoseRole = false;
								break;
							}
						}
						if (gameOwnerShouldLoseRole) {
							message.member.removeRole(message.guild.roles.find("name", "Game Host")).catch(console.log);
						}
					}
					
					let result = new CommandResult(true, "The game has been concluded!");
					result.evaluate(message);
				},
				err => {
					console.log(err);
					let result = new CommandResult(false, "An unknown error occurred while deleting the game. Please ask a moderator for help.");
					result.evaluate(message);
				}
			);
			
			return "Stopping your game...";
		})
	]),
	new CommandArgument("literal", "ip", 1, function(message) {
		let game = findGameSession(message.channel);
		if (!game) {
			return new CommandArgument(false, "Your are not in a game!");
		}
		if (game.serverType == "server") {
			if (game.serverName == "unknown") {
				return "The IP address of the server is unkown.";
			}
			return "The IP address is `" + game.serverName + "` (Minecraft version: " + game.serverVersion + ").";
		}
		else if (game.serverType == "realm") {
			if (game.serverName == "unknown") {
				return "Entrapment is played on Realms, but the owner of the Realm is unknown.";
			}
			return "Entrapment is played on the Realm of " + game.serverName + ".";
		}
		return "I don't know where this game is played.";
	}),
	new CommandArgument("literal", "team", 1, null, [
		new CommandArgument("literal", "blue", 1, function(message) {
			if (message.member.roles.exists("name", "Team Blue")) {
				return new CommandResult(false, "You are already in team blue! Type `" + prefix + "team none` to leave this team.");
			}
			if (message.member.roles.exists("name", "Team Red")) {
				message.member.removeRole(message.guild.roles.find("name", "Team Red"), "Player used `" + prefix + "team` command").catch(console.log);
			}
			message.member.addRole(message.guild.roles.find("name", "Team Blue"), "Player used `" + prefix + "team` command").then(
				() => {
					let result = new CommandResult(true);
					result.evaluate(message);
				},
				err => {
					console.log(err);
					let result = new CommandResult(false, "Something went wrong while joining team blue. Please contact a moderator for help.");
					result.evaluate(message);
				}
			);
		}),
		new CommandArgument("literal", "red", 1, function(message) {
			if (message.member.roles.exists("name", "Team Red")) {
				return new CommandResult(false, "You are already in team red! Type `" + prefix + "team none` to leave this team.");
			}
			if (message.member.roles.exists("name", "Team Blue")) {
				message.member.removeRole(message.guild.roles.find("name", "Team Blue"), "Player used `" + prefix + "team` command").catch(console.log);
			}
			message.member.addRole(message.guild.roles.find("name", "Team Red"), "Player used `" + prefix + "team` command").then(
				() => {
					let result = new CommandResult(true);
					result.evaluate(message);
				},
				err => {
					console.log(err);
					let result = new CommandResult(false, "Something went wrong while joining team red. Please contact a moderator for help.");
					result.evaluate(message);
				}
			);
		}),
		new CommandArgument("literal", "none", 1, function(message) {
			if (message.member.roles.exists("name", "Team Blue")) {
				message.member.removeRole(message.guild.roles.find("name", "Team Blue"), "Player used `" + prefix + "team` command").then(
					() => {
						let result = new CommandResult(true);
						result.evaluate(message);
					},
					err => {
						console.log(err);
						let result = new CommandResult(false, "Something went wrong while leaving your team. Please contact a moderator for help.");
						result.evaluate(message);
					}
				);
			}
			else if (message.member.roles.exists("name", "Team Red")) {
				message.member.removeRole(message.guild.roles.find("name", "Team Red"), "Player used `" + prefix + "team` command").then(
					() => {
						let result = new CommandResult(true);
						result.evaluate(message);
					},
					err => {
						console.log(err);
						let result = new CommandResult(false, "Something went wrong while leaving your team. Please contact a moderator for help.");
						result.evaluate(message);
					}
				);
			}
			else {
				return new CommandResult(false, "You weren't in a team in the first place! Use `" + prefix + "team (blue|red)` to join a team.");
			}
		})
	]),
	new CommandArgument("literal", "random", 0, function(message) {
		return Math.random().toString();
	},
		new CommandArgument("number", "min", 0, function(message, inputs) {
			return (Math.random() * inputs.min).toString();
		},
			new CommandArgument("number", "max", 0, function(message, inputs)  {
				return (Math.random() * (inputs.max - inputs.min) + inputs.min).toString();
			})
		)
	),
	new CommandArgument("literal", "ping", 0, function(message) {
		return new CommandResult(true, "pong");
	}),
	new CommandArgument("literal", "stop", 3, function(message) {
		console.log("Stopping!");
		message.react('👋').then(client.destroy, client.destroy).then(process.exit, process.exit);
	})
	/*
	,new CommandArgument("literal", "impossible", 5, function(message) {
		return "You did the impossible!";
	})
	*/
]);
