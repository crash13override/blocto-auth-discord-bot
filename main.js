require('dotenv').config();
const { Client, Intents, Collection, MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');

const { getTokenBalance } = require('./flowscripts/get_token_balance.js');
const { checkEmeraldIdentityDiscord, trxScripts } = require('./flowscripts/emerald_identity.js');
const { encrypt, decrypt } = require('./helperfunctions/encryption.js');
const { mainnetSign } = require('./helperfunctions/authorization.js')
const { decode } = require('rlp');

const fs = require('fs');
const fcl = require("@onflow/fcl");

const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const cors = require('cors');
var corsOptions = {
    origin: ['https://pedantic-darwin-e512ad.netlify.app', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST']
};
app.use(cors(corsOptions));

fcl.config()
    .put('accessNode.api', 'https://mainnet.onflow.org');

const port = process.env.PORT || 5000;

const prefix = '!';
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

// Gets all of our commands from our commands folder
client.commands = new Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    // command.name is the name of the file,
    // and command has a list of all the module exports
    // in that file.
    client.commands.set(command.name, command);
}

client.once('ready', () => {
    console.log('Emerald bot is online!');
})

// When a user types a message
client.on('messageCreate', message => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    const args = message.content.slice(prefix.length).split(/ +/);
    const command = args.shift().toLowerCase();

    // Executes the youtube.js file
    if (command === 'test') {
        console.log("wtf")
        message.channel.send('Testing!');
    } else if (command === 'youtube') {
        client.commands.get('youtube').execute(message, args);
    } else if (command === 'role') {
        client.commands.get('role').execute(message, args);
    } else if (command === 'setup') {
        client.commands.get('setup').execute(message, args);
    } else if (command === 'emeraldidrole') {
        client.commands.get('getEmeraldIDRole').execute(message, args);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    let customIdArray = interaction.customId.split('-');

    if (customIdArray.length === 2 && customIdArray[0] === 'mainnetemeraldid') {
        let interactionCustomId = interaction.customId.split('-');
        let roleId = interactionCustomId[1];

        let account = await checkEmeraldIdentityDiscord(interaction.member.id);
        console.log("Returned account from ecid", account);

        if (account) {
            /* For EmeraldID in Emerald City ONLY */
            if (roleId === process.env.EMERALDIDROLE) {
                interaction.member.roles.add(roleId).catch((e) => console.log(e));
                interaction.reply({ content: "You have been given the " + `<@&${roleId}>` + " role.", ephemeral: true });
                return;
            } else {
                let guildInfo = await getTokenBalance(account, interaction.guild.id, roleId);
                if (!guildInfo) {
                    interaction.reply({ content: "Error", ephemeral: true });
                    return;
                };
                let { result, number } = guildInfo;
                if (result && (result >= number)) {
                    console.log("Adding role...");
                    interaction.member.roles.add(roleId).catch((e) => console.log(e));
                    interaction.reply({ content: "You have been given the " + `<@&${roleId}>` + " role.", ephemeral: true });
                    return;
                }
                interaction.reply({ content: "You do not have enough tokens.", ephemeral: true });
                return;
            }
        }

        // If they have not verified their EmeraldID...

        let encrypted = encrypt(interaction.member.id);

        // const botInfo = new MessageEmbed().addField(`Hello there! Please click [this](http://localhost:3000/?id=${args.uuid}) link to gain access to Emerald City.`)
        const exampleEmbed = new MessageEmbed()
            .setColor('#5bc595')
            .setDescription('Click the link below to setup your EmeraldID.')
            .setTimestamp()

        const row = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setURL('https://pedantic-darwin-e512ad.netlify.app/emeraldID' + '/?id=' + encrypted)
                    .setLabel('Setup EmeraldID')
                    .setStyle('LINK')
            );

        interaction.reply({ ephemeral: true, embeds: [exampleEmbed], components: [row] });
    } else if (customIdArray.length === 3 && customIdArray[0] === 'role') {
        let roleId = customIdArray[2];
        if (customIdArray[1] === 'join') {
            interaction.member.roles.add(roleId).catch((e) => console.log(e));
            interaction.reply({ content: `You received the <@&${roleId}> role.`, ephemeral: true });
        } else if (customIdArray[1] === 'remove') {
            interaction.member.roles.remove(roleId).catch((e) => console.log(e));
            interaction.reply({ content: `You removed the <@&${roleId}> role.`, ephemeral: true });
        }
    } else {
        interaction.reply({ content: "This interaction is outdated.", ephemeral: true });
    }
});

/* SERVER */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const verifyUserDataWithBlocto = async (user) => {
    // Validate the user
    let accountProofObject = user.services.filter((service) => service.type === 'account-proof')[0]
    if (!accountProofObject) return false
  
    const AccountProof = accountProofObject.data
    const Address = AccountProof.address
    const Timestamp = AccountProof.timestamp
    const Message = fcl.WalletUtils.encodeMessageForProvableAuthnVerifying(
      Address, // Address of the user authenticating
      Timestamp, // Timestamp associated with the authentication
      'APP-V0.0-user', // Application domain tag
    );
    const isValid = await fcl.verifyUserSignatures(
        Message, 
        AccountProof.signatures
    );
    return isValid;
}

app.get('/api/getDiscordID/:discordID', async (req, res) => {
    const { discordID } = req.params;
    try {
        let decryptedDiscordID = decrypt(discordID);
        res.json({
            discordID: decryptedDiscordID
        })
    } catch(e) {
        res.status(500).json({
            message: 'Cannot decode the discordID. Please try the process again.',
        })
    }
});

app.get('/api/getAccount', async (req, res) => {
    // todo: support multi key and defualt key both
    let keyIndex = 0;
    res.json({
        address: "0x39e42c67cc851cfb",
        keyIndex,
    });
});

app.get('/api/getScript/:scriptName', async (req, res) => {
    // only support the script with server sign and verify with signWithVerify api
    const { scriptName } = req.params;
    const scriptCode = trxScripts[scriptName]();
    if (scriptName && scriptCode) {
        res.json({
            scriptCode,
        });
    } else {
        res.status(500).json({
            message: 'Cannot get script with script name',
        });
    }
});
  
app.post('/api/signWithVerify', async (req, res) => {
    const { user, signable, scriptName } = req.body
    // get the script that verify the sign cadence code
    const scriptCode = trxScripts[scriptName]()

    // validate user data with blocto
    const isValid = await verifyUserDataWithBlocto(user);
    if (!isValid) {
        return res.status(500).json({ mesage: 'User data validate failed' });
    }

    // User is now validated //

    const { message } = signable;
    const decoded = decode(Buffer.from(message.slice(64), 'hex'));
    const cadence = decoded[0][0].toString();
    if (scriptCode.replace(/\s/g, "") === cadence.replace(/\s/g, "")) {
        // when the code match , will sign the transaction
        const signature = mainnetSign(message)
        res.json({ signature })
    } else {
        res.status(500).json({ message: 'Script code not supported' })
    }
});

app.listen(port, () => console.log(`Listening on port ${port}`));

// This is the bot's token
// Must be at the bottom of the file
client.login(process.env.TOKEN);