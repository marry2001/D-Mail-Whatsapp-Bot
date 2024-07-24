import axios from 'axios';
import chalk from 'chalk';
import { join } from 'path';
import path from 'path'
const __dirname = path.resolve();
import moment from 'moment';
import didYouMean from 'didyoumean'


export default class MessageHandler {
    constructor(client) {
        this.client = client;
        this.inviteCode = new Map();
        this.path = join[__dirname, '..', 'Commands']
        this.groups;
    }

    handleMessage = async (M) => {
        try {
            const { prefix } = this.client.config;
            const args = M.content.split(' ');
            const title = M.chat === 'dm' ? 'INBOX' : M.groupMetadata?.subject || 'Group';
            const { name } = await this.client.DB.fetchUser(M.sender.jid)
            if (!name) await this.client.DB.updateUser(M.sender.jid, 'name', 'set', M.sender.username)
    

            await this.handleStatus(M)
            await this.moderate(M);
            await this.InviteCode(M);     
            await this.handleAFK(M);
    
            if (!args[0] || !args[0].startsWith(prefix)) {
                return this.logMessage(M, title);
            }
    
            this.logCommand(M, args, title)
            const { bot } = await this.client.DB.getGroup(M.from);
            const commandName = args[0].toLowerCase().slice(prefix.length);
            const command = this.client.commands.commands.get(commandName) || this.client.commands.aliases.get(commandName);
             if (M.chat === 'group' && (bot.toLowerCase() !== 'all' && bot.toLowerCase() !== 'on') && !command && M.sender.jid !== this.client.config.owner && M.sender.jid !== '923045204414@s.whatsapp.net') {
                return;
            }
    
            if (!command) {
                return this.handleUnknownCommand(M, commandName);
            }
    
            if (!this.isCommandAllowed(M, command)) {
                return;
            }
    
            await this.executeCommand(M, command, args);
        } catch (e) {
            this.client.log(e.message, true)
            
        }
    }

    handleStatus = async(M) => {
        if (M.chat === 'group' || !M.status) return;

        const lowerContent = M.content.toLowerCase();
        if (!['send', 'save'].some(keyword => lowerContent.includes(keyword))) return;

        let buffer, type;
        if (M.quoted.message?.imageMessage) {
            buffer = await M.downloadMediaMessage(M.quoted.message);
            type = 'image';
        } else if (M.quoted.message?.videoMessage) {
            buffer = await M.downloadMediaMessage(M.quoted.message);
            type = 'video';
        } else {
            return this.client.log('[ERROR]: Sending status', true);
        }

        if (lowerContent.includes('save')) {
            await this.client.sendMessage(this.client.config.adminsGroup, {
                [type]: buffer,
                caption: 'Here ya go'
            });
        } else if (lowerContent.includes('send')) {
            await M.reply(buffer, type, undefined, undefined, 'Here ya go!');
        }
    }

    logMessage = (M, title) => {
        this.client.log(
            `${chalk.cyanBright('Message')} from ${chalk.yellowBright(M.sender.username)} in ${chalk.blueBright(title)}`
        );
    }

    logCommand = (M, args, title) => {
        this.client.log(
            `${chalk.cyanBright(`Command ${args[0]}[${args.length - 1}]`)} from ${chalk.yellowBright(
                M.sender.username
            )} in ${chalk.blueBright(title)}`
        );
    }

    handleUnknownCommand = async(M, commandName) => {
        const commands = Array.from(this.client.commands.commands.keys());
        const suggestion = didYouMean(commandName, commands);
        if (suggestion) {
            return M.reply(`No such command as ${commandName}\ndid you mean *${suggestion}*? \n\nType *${this.client.config.prefix}mods* to ask JFLEX!`);
        } else {
            M.reply(`No such command, Type *${this.client.config.prefix}help* to see commands!`)
        }
    }

    isCommandAllowed = (M, command) => {
        const isAdmin = M.groupMetadata?.admins?.includes(this.client.correctJid(this.client.user?.id || ''))
        const isGroupCommand = M.chat === 'dm' && !command.config.dm && M.sender.jid !== this.client.config.owner;
        const isGroupAdminRequired = command.config.category === 'group' && !M.sender.isAdmin && M.sender.jid !== this.client.config.owner;
        const isBotAdmin = command.config.category === 'group' && command.config.adminRequired && !isAdmin
        const isDevCommand = command.config.category === 'dev' && M.sender.isMOD && M.sender.jid !== this.client.config.owner;
        const isPrivateCommand = command.config.category === 'owner' && M.sender.jid !== this.client.config.owner;

        if (isGroupCommand) {
            M.reply('Command restricted to groups only.');
            return false;
        }

        if (isGroupAdminRequired) {
            M.reply('You must be an admin to use this command!');
            return false;
        }

        if (isBotAdmin) {
            M.reply('I need to be a admin to execute this command!');
            return false;
        }

        if (isDevCommand) {
            M.reply('This command is only available for MODS!');
            return false;
        }

        if (isPrivateCommand) {
            M.reply('Owner only command!');
            return false;
        }

        return true;
    }

    executeCommand = async(M, command, args) => {
        try {
            await command.run(M, this.formatArgs(args));
        } catch (error) {
            this.client.log(error.message, true);
        }
    }

    moderate = async(M) => {
        try {
            const { antilink } = await this.client.DB.getGroup(M.from)
            if (
                !antilink ||
                M.sender.isAdmin ||
                !M.groupMetadata?.admins?.includes(this.client.correctJid(this.client.user?.id || ''))
            )
                return void null
            const urls = M.urls
            if (urls.length > 0) {
                const groupinvites = urls.filter((url) => url.includes('chat.whatsapp.com'))
                if (groupinvites.length > 0) {
                    groupinvites.forEach(async (invite) => {
                        const code = await this.client.groupInviteCode(M.from)
                        const inviteSplit = invite.split('/')
                        if (inviteSplit[inviteSplit.length - 1] !== code) {
                            const title = M.groupMetadata?.subject || 'Group'
                            this.client.log(
                                `${chalk.blueBright('MOD')} ${chalk.green('Group Invite')} by ${chalk.yellow(
                                    M.sender.username
                                )} in ${chalk.cyanBright(title)}`
                            )
                            if (M.message.key.fromMe) return void null
                            await this.client.sendMessage(M.from, {
                                delete: M.message.key
                            })
                            return void (await this.client.groupParticipantsUpdate(M.from, [M.sender.jid], 'remove'))
                        }
    
                    })
                }
            }        
        } catch (e) {
            this.client.log(e.message, true)
        }}

    InviteCode = async (M) => {
        try {
            try {
                if (M.chat !== 'group') {
                    const urls = M.urls
                    if (!urls.length) return void null
                    const groupinvites = urls.filter((url) => url.includes('chat.whatsapp.com'))
                    if (!groupinvites.length) return void null
                    this.client.log(
                        `${chalk.blueBright('GROUP REQUEST')} from ${chalk.yellowBright(
                            M.sender.username
                        )} in ${chalk.cyanBright('DM')}`
                    )
                    const text = `Request from *@${M.sender.jid.split('@')[0]}*\n\n${M.content}`
                    if (M.message.key.fromMe) return void null
                    let sendMsg = this.client.config.adminsGroup
                    await this.client.sendMessage(sendMsg, {
                        text,
                        mentions: [M.sender.jid]
                    })
                    return void M.reply('Request sent successfully.')
                }
            } catch (e) {
                this.client.log(e.message, true)
            }
            if (M.chat !== 'group' && M.type === "groupInviteMessage") {
                this.client.log(
                    `${chalk.blueBright('GROUP INVTE REQUEST')} from ${chalk.yellowBright(
                        M.sender.username
                    )} in ${chalk.cyanBright('DM')}`
                )
                this.inviteCode.set(M.message.message.groupInviteMessage.groupJid, {
                    key: M.message.key,
                    code: M.message.message.groupInviteMessage
                })
                let sendMsg = this.client.config.adminsGroup
                await this.client.sendMessage(sendMsg, {
                    forward: M.message
                })
                return
            }
        } catch (e) {
            this.client.log(e.message, true)
        }
    }


     handleAFK = async(M) => {
        const user = await this.client.DB.fetchUser(M.sender.jid);  
        if (M.sender.jid === this.client.config.owner && !this.client.config.afkPermenant && user.afk?.custom) {
            M.reply(`Welcome back ${M.sender.username}! You were AFK. Reason: ${user.afk.reason}`);
            await this.client.DB.updateUser(M.sender.jid, 'afk', 'set', { custom: false, reason: '', time: new Date() });
        } else {
            this.handleMentionedUser(M);
        }
    }
    
    handleMentionedUser = async(M) => {
        const mentionedUser = M.mentionByTag?.[0];
        if (!mentionedUser) return;
        const afkUser = await this.client.DB.fetchUser(mentionedUser);
        if (!afkUser.afk?.custom) return;
        const totalMinutes = moment().diff(moment(afkUser.afk.time), 'minutes');
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const minutes = totalMinutes % 60;
        const timeAfk = days > 0 ? `${days} days, ${hours} hours, ${minutes} minutes` :
                        hours > 0 ? `${hours} hours, ${minutes} minutes` : `${minutes} minutes`;
    
        const messageText = `${afkUser.name} is currently AFK\n\n*Reason*: ${afkUser.afk.reason}\n\n*For*: ${timeAfk}`;
        const message = afkUser.afk?.url ? { image: { url: afkUser.afk.url }, caption: messageText, quoted: M.message } : { text: messageText, mentions: [] };
    
        await this.client.sendMessage(M.from, message);
    }
    

     chatBot = async(M) => {
        const text = M.content;
        const botNumber = await this.client.utils.sanitizeJid(await this.client.user?.id);
        const { chatbot } = await this.client.DB.getGroup(M.from);

        if (M.chat === 'group' && chatbot) {
            if (M.quoted && !M.message.key.fromMe && M.quoted.sender.jid === botNumber) {
                await this.client.sendPresenceUpdate("composing", M.from);
                const { data } = await axios.get(`${this.client.config.API_URL}private?prompt=` + text);
                return void M.reply(data);
            }
        }
    }

        formatArgs = (args) => {
            args.splice(0, 1)
            return {
                args,
                context: args.join(' ').trim(),
                flags: args.filter((arg) => arg.startsWith('--'))
            }
        }
    };
