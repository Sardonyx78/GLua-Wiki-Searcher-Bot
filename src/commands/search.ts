import { Client, Message, MessageEmbed } from "discord.js";
import { Command } from "../Command";
import { JSDOM } from "jsdom"
import fetch from "node-fetch";
import AsciiTable = require("table")
import Fuse from "fuse.js";

const root = "https://wiki.facepunch.com"
const base = root + "/gmod"

const author = {
     url: base,
     iconURL: "https://files.facepunch.com/garry/822e60dc-c931-43e4-800f-cbe010b3d4cc.png",
     name: "Garry's Mod Wiki"
}

function testArray(inital: string[]): string[][] {
     if (inital.join("\n\n").length < 1024) return [inital]

     const temp = []
     for (let i = 0; temp.flat().length < inital.length;) {
          const part = inital.slice(0, i)

          if (part.join("\n\n").length > 1024) temp.push(inital.slice(0, i - 1))
          else i++
     }
     return temp
}

export default class SearchCommand extends Command {
     helpMsg = "FacePunch Wikisinde bir şeyi arar.";
     variations = ["search", "ara", "wikiara"];
     searchList: { search: string, href: string }[] = [];
     fuse: Fuse<{ search: string, href: string }>

     constructor(client: Client) {
          super(client);
          this.prepareSearchSet();
     }

     async prepareSearchSet() {
          if (this.searchList.length == 0) {
               const res = await fetch(`${base}`);

               const { window } = new JSDOM(await res.text());

               this.searchList = Array.from(window.document.querySelector("#contents > div:nth-child(6)").querySelectorAll("a")).map((el: HTMLAnchorElement) => ({
                    href: el.getAttribute("href"),
                    search: el.getAttribute("search")
               }))

               this.fuse = new Fuse(this.searchList, {
                    includeScore: true,
                    keys: [
                         "search",
                    ]
               });
          }
     }

     async eval(message: Message, args: string[]) {
          if (!args[1]) return;

          const msg = await message.channel.send(new MessageEmbed({
               color: 0x2f3136,
               description: "<a:loading:783235493201969204>"
          }))

          let searchResults = this.fuse.search(args[1]);

          if (searchResults.length == 0) return msg.edit(new MessageEmbed({
               color: 0xe54c3c,
               title: ":/",
               description: "Hiçbir sonuç bulamadık."
          }))


          if (searchResults.length > 1 && (searchResults[1].score - searchResults[0].score)/searchResults[1].score > 0.7) searchResults = searchResults.slice(0, 1);
          else {
               const searchResultsSameScore = searchResults.filter((result: any) => (result.score <= searchResults[0].score));
               searchResults = searchResults.slice(0, Math.min(10, Math.max(5, searchResultsSameScore.length)))
          }

          if (searchResults.length > 1) {
               const resultsLinks = searchResults.map((result: any) => `**[${result.item.search}](${root}${result.item.href})**`)
               msg.edit(new MessageEmbed({
                    color: 0x0082ff,
                    description: "**Aradığınız şeye dair bir çok şey buldum, bir tanesini tekrar aratabilirsiniz:**\n\n" + resultsLinks.join("\n"), // TODO: maybe do the reaction thing?
                    author
               }))
          } else {
               const res = await fetch(`${root}${searchResults[0].item.href}?format=json`)

               const { window } = new JSDOM(await res.json().then(x => x.html))

               if (window.document.getElementsByClassName("function_line")[0]) {
                    const funcargs = Array.from(window.document.getElementsByClassName("function_arguments")[0].children).map((x) => {
                         const children = Array.from(x.children)
                         const type: HTMLAnchorElement = children.find(x => x.tagName === "A") as HTMLElement as HTMLAnchorElement
                         const name = children.find(x => x.classList.contains("name")).textContent
                         const defaultValue = children.find(x => x.classList.contains("default"))
                         const description = children.find(x => x.classList.contains("numbertagindent")).textContent

                         return `- **[${type.textContent}](${root}${(type.href)}) ${name}** ${defaultValue ? `\`${defaultValue.textContent.trim()}\`` : ""}\n${description}`
                    })

                    const fields = [{
                         name: "Açıklama",
                         value: (window.document.getElementsByClassName("function_description")[0] as HTMLDivElement).textContent
                    }, {
                         name: "Argümanlar",
                         value: funcargs.join("\n\n")
                    }]

                    const returned = window.document.getElementsByClassName("function_returns")[0]

                    if (returned) {
                         const children = Array.from(window.document.getElementsByClassName("function_returns")[0].children)

                              .map(x => {
                                   const returnChildren = Array.from(x.children)
                                   const type = returnChildren.find(y => y.tagName === "A") as HTMLElement as HTMLAnchorElement
                                   const description = returnChildren.find(y => y.classList.contains("numbertagindent")).textContent

                                   return `- **[${type.textContent}](${root}${(type.href)})**\n${description}`
                              })

                         fields.push({
                              name: "Döndürülen",
                              value: children.join("\n\n")
                         })
                    }

                    msg.edit(new MessageEmbed({
                         color: 0x0082ff,
                         title: searchResults[0].item.search,
                         url: `${root}${searchResults[0].item.href}`,
                         description: "```lua\n" + (window.document.getElementsByClassName("function_line")[0] as HTMLDivElement).textContent.trim() + "\n```",
                         fields,
                         author
                    }))
               } else if (window.document.getElementsByClassName("type")[0]) {
                    const desc = window.document.querySelector("#pagecontent > div > div.section") || window.document.querySelector(".function_description");
                    const children_desc = Array.from(desc.children)
                    const tables = children_desc.filter(x => x.tagName === "TABLE")
                    const codes = children_desc.filter(x => x.classList.contains("code"))

                    for (const i in tables) {
                         const table = tables[i]
                         const children = Array.from(table.children)
                         const p = window.document.createElement("p")
                         p.innerHTML = "```\n" + AsciiTable.table([Array.from(children.find(x => x.tagName === "THEAD").firstChild.childNodes).map(x => x.textContent),
                         ...Array.from(children.find(x => x.tagName === "TBODY").childNodes).map(x => Array.from(x.childNodes).map(x => x.textContent))].filter(z => z.length).map(z => z.filter(t => t !== "\n"))) + "\n```"
                         desc.replaceChild(p, tables[i])
                    }

                    for (const i in codes) {
                         const cb = codes[i]
                         const p = window.document.createElement("p")

                         p.innerHTML = "```lua\n" + cb.textContent + "```"

                         desc.replaceChild(p, cb)
                    }

                    const paragraphs = children_desc.filter(x => x.tagName === "P") as HTMLParagraphElement[]

                    for (const old_paragraph of paragraphs) {
                         const paragraph = window.document.createElement("p")
                         paragraph.innerHTML = old_paragraph.innerHTML

                         const children = Array.from(paragraph.children) as HTMLAnchorElement[]

                         children.forEach(alink => {
                              const p = window.document.createElement("p")
                              p.innerHTML = `[${alink.textContent}](${root}${alink.href})`
                              paragraph.replaceChild(p, alink)
                         })

                         desc.replaceChild(paragraph, old_paragraph)
                    }

                    const methods = Array.from(window.document.getElementsByClassName("member_line")).map(x => {
                         const children = Array.from(x.children);

                         (<HTMLAnchorElement[]>children.filter(y => y.tagName === "A")).forEach((z) => {
                              const p = window.document.createElement("p")
                              p.innerHTML = `[${z.textContent}](${root}${z.href})`
                              x.replaceChild(p, z)
                         });

                         (<HTMLDivElement[]>children.filter(y => y.classList.contains("summary"))).forEach((z) => {
                              const p = window.document.createElement("p")
                              p.innerHTML = `**\n${z.textContent.split("\n")[0]}`
                              x.replaceChild(p, z)
                         });

                         return `- **${x.textContent.trim()}`
                    })

                    const mets = testArray(methods)

                    msg.edit(new MessageEmbed({
                         color: 0x0082ff,
                         title: searchResults[0].item.search,
                         url: root + `${searchResults[0].item.href}`,
                         description: desc.textContent.length < 1000 ? desc.textContent.substring(0, 1000) : desc.textContent,
                         fields: [{
                              name: "Metodlar",
                              value: mets[0].join("\n\n")
                         }, ...mets.slice(1, mets.length).map(x => ({ name: "­", value: x.join("\n\n") }))],
                         author,
                         footer: {
                              text: "Metodların hepisini görebilmek için siteye uğrayabilirsin."
                         }
                    }))
               }
          }
     }
}