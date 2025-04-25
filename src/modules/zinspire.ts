import { config } from "../../package.json"
import { getString } from "../utils/locale";
import { getPref } from "../utils/prefs";
import { ProgressWindowHelper } from "zotero-plugin-toolkit/dist/helpers/progressWindow";
import { searchCNKI } from "./services/cnki"
export class ZInsUtils {
  static registerPrefs() {
    const prefOptions = {
      pluginID: config.addonID,
      src: rootURI + "content/preferences.xhtml",
      image: `chrome://${config.addonRef}/content/icons/inspire@2x.png`,
      defaultXUL: true,
    };
    Zotero.PreferencePanes.register(prefOptions);
  }

  static registerNotifier() {
    const callback = {
      notify: async (
        event: string,
        type: string,
        ids: number[] | string[],
        extraData: { [key: string]: any },
      ) => {
        if (!addon?.data.alive) {
          this.unregisterNotifier(notifierID);
          return;
        }
        addon.hooks.onNotify(event, type, ids, extraData);
      },
    };

    const notifierID = Zotero.Notifier.registerObserver(callback, [
      "item",
    ]);

    Zotero.Plugins.addObserver({
      shutdown: ({ id }) => {
        if (id === addon.data.config.addonID)
          this.unregisterNotifier(notifierID);
      },
    });
  }

  private static unregisterNotifier(notifierID: string) {
    Zotero.Notifier.unregisterObserver(notifierID);
  }

}

export class ZInsMenu {
  static registerRightClickMenuPopup() {
    ztoolkit.Menu.register("item", {
      tag: "menuseparator",
      isHidden: () =>
        Zotero.getActiveZoteroPane()
          .getSelectedItems()
          .some((item) => {
            return !item.isRegularItem();
          }),
    });
    const menuIcon = `chrome://${config.addonRef}/content/icons/inspire.png`;
    ztoolkit.Menu.register("item",
      {
        tag: "menu",
        label: getString("menupopup-label"),
        children: [
          {
            tag: "menuitem",
            label: getString("menuitem-submenulabel0"),
            commandListener: (_ev) => {
              _globalThis.inspire.updateSelectedItems("full")
            }
          },
          {
            tag: "menuitem",
            label: getString("menuitem-submenulabel1"),
            commandListener: (_ev) => {
              _globalThis.inspire.updateSelectedItems("noabstract")
            }
          },
          {
            tag: "menuitem",
            label: getString("menuitem-submenulabel2"),
            commandListener: (_ev) => {
              _globalThis.inspire.updateSelectedItems("citations")
            }
          },
        ],
        icon: menuIcon,
        isHidden: () =>
          Zotero.getActiveZoteroPane()
            .getSelectedItems()
            .some((item) => {
              return !item.isRegularItem();
            }),
      },
      // "before",
      // document.querySelector(
      //   "#zotero-itemmenu-addontemplate-test",
      // ) as XUL.MenuItem,
    );
    // ztoolkit.Menu.register("menuFile", {
    //   tag: "menuseparator",
    // });
  }

  static registerRightClickCollectionMenu() {
    ztoolkit.Menu.register("collection", {
      tag: "menuseparator",
    });
    const menuIcon = `chrome://${config.addonRef}/content/icons/inspire.png`;
    ztoolkit.Menu.register("collection",
      {
        tag: "menu",
        label: getString("menupopup-label"),
        children: [
          {
            tag: "menuitem",
            label: getString("menuitem-submenulabel0"),
            commandListener: (_ev) => {
              _globalThis.inspire.updateSelectedCollection("full")
            }
          },
          {
            tag: "menuitem",
            label: getString("menuitem-submenulabel1"),
            commandListener: (_ev) => {
              _globalThis.inspire.updateSelectedCollection("noabstract")
            }
          },
          {
            tag: "menuitem",
            label: getString("menuitem-submenulabel2"),
            commandListener: (_ev) => {
              _globalThis.inspire.updateSelectedCollection("citations")
            }
          },
        ],
        icon: menuIcon,
      },
      // "before",
      // document.querySelector(
      //   "#zotero-itemmenu-addontemplate-test",
      // ) as XUL.MenuItem,
    );
  }
}

type jsobject = {
  [key: string]: any;
};
export class ZInspire {
  current: number;
  toUpdate: number;
  itemsToUpdate: Zotero.Item[];
  numberOfUpdatedItems: number;
  counter: number;
  CrossRefcounter: number;
  CNKIcounter: number;
  error_norecid: boolean;
  error_norecid_shown: boolean;
  final_count_shown: boolean;
  progressWindow: ProgressWindowHelper;
  constructor(current: number = -1, toUpdate: number = 0, itemsToUpdate: Zotero.Item[] = [], numberOfUpdatedItems: number = 0, counter: number = 0, CrossRefcounter: number = 0, CNKIcounter: number = 0, error_norecid: boolean = false, error_norecid_shown: boolean = false, final_count_shown: boolean = false) {
    this.current = current
    this.toUpdate = toUpdate
    this.itemsToUpdate = itemsToUpdate
    this.numberOfUpdatedItems = numberOfUpdatedItems
    this.counter = counter
    this.CrossRefcounter = CrossRefcounter
    this.CNKIcounter = CNKIcounter
    this.error_norecid = error_norecid
    this.error_norecid_shown = error_norecid_shown
    this.final_count_shown = final_count_shown
    this.progressWindow = new ztoolkit.ProgressWindow(config.addonName, {
      closeOnClick: true,
      closeTime: -1,
    })
  }

  resetState(operation: string) {
    if (operation === "initial") {
      if (this.progressWindow) {
        this.progressWindow.close();
      }
      this.current = -1;
      this.toUpdate = 0;
      this.itemsToUpdate = [];
      this.numberOfUpdatedItems = 0;
      this.counter = 0;
      this.CrossRefcounter = 0;
      this.CNKIcounter = 0;
      this.error_norecid = false;
      this.error_norecid_shown = false;
      this.final_count_shown = false;
    } else {
      // if (this.error_norecid) {
      //   this.progressWindow.close();
      //   const icon = "chrome://zotero/skin/cross.png";
      //   if (this.error_norecid && !this.error_norecid_shown) {
      //     //ztoolkit.log("hello");
      //     const progressWindowNoRecid = new ztoolkit.ProgressWindow(config.addonName, { closeOnClick: true });
      //     progressWindowNoRecid.changeHeadline("INSPIRE recid not found");
      //     if (getPref("tag_enable") && getPref("tag_norecid") !== "") {
      //       // progressWindowNoRecid.ItemProgress.setText("No INSPIRE recid was found for some items. These have been tagged with '" + getPref("tag_norecid") + "'.")
      //       progressWindowNoRecid.createLine({ icon: icon, text: "No INSPIRE recid was found for some items. These have been tagged with '" + getPref("tag_norecid") + "'." });
      //     } else {
      //       // progressWindowNoRecid.ItemProgress.setText("No INSPIRE recid was found for some items.")
      //       progressWindowNoRecid.createLine({ icon: icon, text: "No INSPIRE recid was found for some items." });
      //     }
      //     progressWindowNoRecid.show();
      //     progressWindowNoRecid.startCloseTimer(8000);
      //     this.error_norecid_shown = true;
      //   }
      // } else {
      //   if (!this.final_count_shown) {
      //     const icon = "chrome://zotero/skin/tick.png";
      //     this.progressWindow = new ztoolkit.ProgressWindow(config.addonName, {
      //       closeOnClick: true,
      //     });
      //     this.progressWindow.changeHeadline("Finished");
      //     // ztoolkit.log(this.progressWindow.ItemProgress)
      //     if (operation === "full" || operation === "noabstract") {
      //       this.progressWindow.createLine({
      //         text: "INSPIRE metadata updated for " +
      //           this.counter + " items.", progress: 100
      //       });
      //     } else if (operation === "citations") {
      //       this.progressWindow.createLine({
      //         text: "INSPIRE citations updated for " +
      //           this.counter + " items;\n" +
      //           "CrossRef citations updated for " +
      //           this.CrossRefcounter + " items.",
      //         progress: 100
      //       });
      //     }
      //     this.progressWindow.show();
      //     this.progressWindow.startCloseTimer(4000);
      //     this.final_count_shown = true;
      //   }
      // }
      const iconTick = "chrome://zotero/skin/tick.png";
      const iconCross = "chrome://zotero/skin/cross.png";
      if (operation != "citations") {
        this.progressWindow.close();
        // const icon = "chrome://zotero/skin/cross.png";
        //ztoolkit.log("hello");
        const progressWindowNoRecid = new ztoolkit.ProgressWindow(config.addonName, { closeOnClick: true });
        let unUpdated = this.toUpdate - this.counter;
        if (getPref("tag_enable") && getPref("tag_norecid") !== "") {
          progressWindowNoRecid.createLine({
            icon: unUpdated > 0 ? iconCross : iconTick,
            text: this.toUpdate + (this.toUpdate > 1 ? " items" : " item") + " processed.\n" +
              (this.counter > 0 ? "INSPIRE metadata updated for " + this.counter + (this.counter > 1 ? " items.\n" : " item.\n") : "") +
              (unUpdated > 0 ? "No INSPIRE recid was found for " + unUpdated + (unUpdated > 1 ? " items, which have" : " item, which has") + " been tagged with '" + getPref("tag_norecid") + "'." : "")
          });
        } else {
          progressWindowNoRecid.createLine({
            icon: unUpdated > 0 ? iconCross : iconTick,
            text: this.toUpdate + (this.toUpdate > 1 ? " items" : " item") + " processed.\n" +
              (this.counter > 0 ? "INSPIRE metadata updated for " + this.counter + (this.counter > 1 ? " items.\n" : " item.\n") : "") +
              (unUpdated > 0 ? "No INSPIRE recid was found for " + unUpdated + (unUpdated > 1 ? " items." : " item.") : "")
          });
        }
        progressWindowNoRecid.show();
        progressWindowNoRecid.startCloseTimer(8000);
        this.error_norecid_shown = true;
      } else {
        if (!this.final_count_shown) {
          /// const icon = "chrome://zotero/skin/tick.png";
          this.progressWindow = new ztoolkit.ProgressWindow(config.addonName, {
            closeOnClick: true,
          });
          let unUpdated = this.toUpdate - this.counter - this.CrossRefcounter - this.CNKIcounter;
          this.progressWindow.createLine({
            icon: unUpdated > 0 ? iconCross : iconTick,
            text: this.toUpdate + (this.toUpdate > 1 ? " items" : " item") + " processed.\n" +
              (this.counter > 0 ? "INSPIRE citations updated for " + this.counter + (this.counter > 1 ? " items.\n" : " item.\n") : "") +
              (this.CrossRefcounter > 0 ? "CrossRef citations updated for " + this.CrossRefcounter + (this.CrossRefcounter > 1 ? " items.\n" : " item.\n") : "") +
              (this.CNKIcounter > 0 ? "CNKI citations updated for " + this.CNKIcounter + (this.CNKIcounter > 1 ? " items.\n" : " item.\n") : "") +
              (unUpdated > 0 ? "No citation data was found for " + unUpdated + (unUpdated > 1 ? " items." : " item.") : ""),
            progress: 100
          });
          this.progressWindow.show();
          this.progressWindow.startCloseTimer(4000);
          this.final_count_shown = true;
        }
      }
    }
  }

  updateSelectedCollection(operation: string) {
    const collection = ZoteroPane.getSelectedCollection();
    if (collection) {
      const items = collection.getChildItems(false, false);
      this.updateItems(items, operation);
    }
  }

  updateSelectedItems(operation: string) {
    this.updateItems(ZoteroPane.getSelectedItems(), operation);
  };

  updateItems(items0: Zotero.Item[], operation: string) {


    // don't update note items
    const items = items0.filter(item => item.isRegularItem());

    if (items.length === 0 ||
      this.numberOfUpdatedItems <
      this.toUpdate) {
      return;
    }


    this.resetState("initial");
    this.toUpdate = items.length;
    this.itemsToUpdate = items;

    // Progress Windows
    this.progressWindow =
      new ztoolkit.ProgressWindow(config.addonName, {
        closeOnClick: false
      });
    const icon = 'chrome://zotero/skin/toolbar-advanced-search' +
      // @ts-ignore - Plugin instance is not typed
      (Zotero.hiDPI ? "@2x" : "") + '.png';
    if (operation === "full" || operation === "noabstract") {
      this.progressWindow.changeHeadline(
        "Getting INSPIRE metadata", icon);
    }
    if (operation === "citations") {
      this.progressWindow.changeHeadline(
        "Getting INSPIRE citation counts", icon);
    }
    const inspireIcon =
      `chrome://${config.addonRef}/content/icons/inspire` +
      // @ts-ignore - Plugin instance is not typed
      (Zotero.hiDPI ? "@2x" : "") + '.png';
    this.progressWindow.createLine({ text: "Retrieving INSPIRE metadata.", icon: inspireIcon });
    this.updateNextItem(operation);
  }

  updateNextItem(operation: string) {
    this.numberOfUpdatedItems++;

    if (this.current === this.toUpdate - 1) {
      this.progressWindow.close();
      this.resetState(operation);
      return;
    }

    this.current++;

    // Progress Windows
    const percent = Math.round((this.numberOfUpdatedItems / this.toUpdate) * 100);
    this.progressWindow.changeLine({ progress: percent });
    this.progressWindow.changeLine({
      text:
        "Item " + this.current + " of " +
        this.toUpdate
    });
    this.progressWindow.show();

    this.updateItem(
      this.itemsToUpdate[this.current],
      operation);
  };

  async updateItem(item: Zotero.Item, operation: string) {
    if (operation === "full" || operation === "noabstract" || operation === "citations") {

      // await removeArxivNote(item)

      const metaInspire = await getInspireMeta(item, operation);
      // Zotero.debug(`updateItem metaInspire: ${metaInspire}`);
      if (metaInspire !== -1 && metaInspire.recid !== undefined) {
        if (item.hasTag(getPref("tag_norecid") as string)) {
          item.removeTag(getPref("tag_norecid") as string);
          item.saveTx();
        }
        // // if (metaInspire.journalAbbreviation && (item.itemType === 'report' || item.itemType === 'preprint')) {
        // if (item.itemType === 'report' || item.itemType === 'preprint') {
        //   item.setType(Zotero.ItemTypes.getID('journalArticle') as number);
        // }

        // if (item.itemType !== 'book' && metaInspire.document_type == 'book') item.setType(Zotero.ItemTypes.getID('book') as number);

        await setInspireMeta(item, metaInspire, operation);
        item.saveTx();
        this.counter++;
      } else {
        if (getPref("tag_enable") && getPref("tag_norecid") !== "" && !item.hasTag(getPref("tag_norecid") as string)) {
          item.addTag(getPref("tag_norecid") as string, 1);
          item.saveTx();
        } else if (!getPref("tag_enable") && item.hasTag(getPref("tag_norecid") as string)) {
          item.removeTag(getPref("tag_norecid") as string);
          item.saveTx();
        }
        this.error_norecid = true;
        if (operation == "citations") {
          const crossref_count = await setCrossRefCitations(item);
          item.saveTx();
          if (crossref_count >= 0) {
            this.CrossRefcounter++
          } else {
            if (/[\u4e00-\u9fa5]/.test(item.getField("title"))) {
              const cnki_count = await setCNKICitations(item);
              item.saveTx();
              if (cnki_count > 0) {
                this.CNKIcounter++
              }
            }
          }
        }
      }
      this.updateNextItem(operation);

    } else {
      this.updateNextItem(operation);
    }
  };
}

async function getInspireMeta(item: Zotero.Item, operation: string) {

  const metaInspire: jsobject = {};

  const doi0 = item.getField('DOI') as string;
  let doi = doi0;
  const url = item.getField('url') as string;
  const extra = item.getField('extra') as string;
  let searchOrNot = 0;

  let idtype = 'doi';
  const arxivReg = new RegExp(/arxiv/i)
  if (!doi || arxivReg.test(doi)) {

    if (extra.includes('arXiv:') || extra.includes('_eprint:')) { // arXiv number from Extra
      idtype = 'arxiv';
      const regexArxivId = /(arXiv:|_eprint:)(.+)/ //'arXiv:(.+)'
      /* in this way, different situations are included:
      New and old types of arXiv number; 
      whether or not the arXiv line is at the end of extra
      */
      if (extra.match(regexArxivId)) {
        const arxiv_split = (extra.match(regexArxivId) || "   ")[2].split(' ')
        arxiv_split[0] === '' ? doi = arxiv_split[1] : doi = arxiv_split[0]
      }
    } else if (/(doi|arxiv|\/literature\/)/i.test(url)) {
      // patt taken from the Citations Count plugin
      const patt = /(?:arxiv.org[/]abs[/]|arXiv:)([a-z.-]+[/]\d+|\d+[.]\d+)/i;
      const m = patt.exec(url);
      if (!m) { // DOI from url
        if (/doi/i.test(url)) {
          doi = url.replace(/^.+doi.org\//, '')
        } else if (url.includes('/literature/')) {
          const _recid = /[^/]*$/.exec(url) || "    "
          if (_recid[0].match(/^\d+/)) {
            idtype = 'literature';
            doi = _recid[0]
          }
        }
      } else { // arxiv number from from url
        idtype = 'arxiv';
        doi = m[1];
      }
    } else if (/DOI:/i.test(extra)) { // DOI in extra
      const regexDOIinExtra = /DOI:(.+)/i
      doi = (extra.match(regexDOIinExtra) || "")[1].trim()
    } else if (/doi\.org\//i.test(extra)) {
      const regexDOIinExtra = /doi\.org\/(.+)/i
      doi = (extra.match(regexDOIinExtra) || "")[1]
    } else { // INSPIRE recid in archiveLocation or Citation Key in Extra
      const _recid = item.getField('archiveLocation') as string;
      if (_recid.match(/^\d+/)) {
        idtype = 'literature';
        doi = _recid
      }
    }
  } else if (/doi/i.test(doi)) { //doi.includes("doi")
    doi = doi.replace(/^.+doi.org\//, '') //doi.replace('https://doi.org/', '')
  }

  if (!doi && extra.includes('Citation Key:')) searchOrNot = 1
  const t0 = performance.now();

  let urlInspire = "";
  if (searchOrNot === 0) {
    const edoi = encodeURIComponent(doi);
    urlInspire = "https://inspirehep.net/api/" + idtype + "/" + edoi;
  } else if (searchOrNot === 1) {
    const citekey = (extra.match(/^.*Citation\sKey:.*$/mg) || "")[0].split(': ')[1]
    urlInspire = "https://inspirehep.net/api/literature?q=texkey%20" + encodeURIComponent(citekey);
  }

  if (!urlInspire) return -1;

  // Zotero.debug(`urlInspire: ${urlInspire}`);

  let status: number | null = null;
  const response = await fetch(urlInspire)
    //   .then(response => response.json())
    .then(response => {
      if (response.status !== 404) {
        status = 1;
        return response.json()
      }
    })
    .catch(_err => null) as any;

  // Zotero.debug(`getInspireMeta response: ${response}, status: ${status}`)
  if (status === null) {
    return -1;
  }

  const t1 = performance.now();
  // Zotero.debug(`Fetching INSPIRE meta took ${t1 - t0} milliseconds.`)

  try {
    const meta = (() => {
      if (searchOrNot === 0) {
        return response['metadata']
      } else {
        const hits = response['hits'].hits
        if (hits.length === 1) return hits[0].metadata
      }
    })()

    metaInspire.recid = meta['control_number']

    metaInspire.citation_count = meta['citation_count']
    metaInspire.citation_count_wo_self_citations = meta['citation_count_without_self_citations']

    // Zotero.debug(`metaInspire.recid: ${metaInspire.recid}`)

    if (operation !== "citations") {

      // get only the first doi
      if (meta['dois']) {
        metaInspire.DOI = meta['dois'][0].value
      }

      // Zotero.debug(`meta['dois']: ${meta['dois']}, meta['arxiv_eprints']: ${meta['arxiv_eprints'][0].value}`)

      if (meta['publication_info']) {
        const publication_info = meta['publication_info']
        // Zotero.debug(`publication_info: ${publication_info[0]}`)
        const pubinfo_first = publication_info[0]
        if (pubinfo_first.journal_title) {
          let jAbbrev = ""
          jAbbrev = pubinfo_first.journal_title;
          metaInspire.journalAbbreviation = jAbbrev.replace(/\.\s|\./g, ". ");
          pubinfo_first.journal_volume && (metaInspire.volume = pubinfo_first.journal_volume);
          if (pubinfo_first.artid) {
            metaInspire.pages = pubinfo_first.artid;
          } else if (pubinfo_first.page_start) {
            metaInspire.pages = pubinfo_first.page_start
            pubinfo_first.page_end && (metaInspire.pages = metaInspire.pages + "-" + pubinfo_first.page_end)
          }
          metaInspire.date = pubinfo_first.year;
          metaInspire.issue = pubinfo_first.journal_issue
        };

        // for erratum, added by FK Guo, date: 2023-08-27
        // support multiple errata
        const pubinfoLength = publication_info.length
        if (pubinfoLength > 1) {
          const errNotes: string[] = [];
          for (let i = 1; i < pubinfoLength; i++) {
            const pubinfo_next = publication_info[i];
            if (pubinfo_next.material == "erratum") {
              const jAbbrev = pubinfo_next.journal_title;
              let pagesErr = ""
              if (pubinfo_next.artid) {
                pagesErr = pubinfo_next.artid;
              } else if (pubinfo_next.page_start) {
                pagesErr = pubinfo_next.page_start
                pubinfo_next.page_end && (pagesErr = pagesErr + "-" + pubinfo_next.page_end)
              }
              errNotes[i - 1] = `Erratum: ${jAbbrev} ${pubinfo_next.journal_volume}, ${pagesErr} (${pubinfo_next.year})`
            }
            // add additional publication information in LaTeX-EU format, if any, as a note; FKG, date: 2023-10-20
            else if (pubinfo_next.journal_title && (pubinfo_next.page_start || pubinfo_next.artid)) {
              let pages_next = ""
              if (pubinfo_next.page_start) {
                pages_next = pubinfo_next.page_start
                if (pubinfo_next.page_end) {
                  pages_next = pages_next + "-" + pubinfo_next.page_end
                }
              } else if (pubinfo_next.artid) {
                pages_next = pubinfo_next.artid
              }
              errNotes[i - 1] = `${pubinfo_next.journal_title}  ${pubinfo_next.journal_volume} (${pubinfo_next.year}) ${pages_next}`
            }
            if (pubinfo_next.pubinfo_freetext) {
              errNotes[i - 1] = pubinfo_next.pubinfo_freetext
            }
            //
          }
          if (errNotes.length > 0) {
            metaInspire.note = `[${errNotes.join(', ')}]`
          }
          metaInspire.note = `[${errNotes.join(', ')}]`
        }
      }

      const metaArxiv = meta['arxiv_eprints']

      // Zotero.debug(`metaArxiv: ${metaArxiv}`)

      if (metaArxiv) {
        metaInspire.arxiv = metaArxiv[0]
        metaInspire.urlArxiv = 'https://arxiv.org/abs/' + metaInspire.arxiv.value
      }

      const metaAbstract = meta['abstracts']

      if (metaAbstract) {
        const abstractInspire = metaAbstract
        metaInspire.abstractNote = abstractInspire[0].value
        if (abstractInspire.length > 0) for (let i = 0; i < abstractInspire.length; i++) {
          if (abstractInspire[i].source === "arXiv") {
            (metaInspire.abstractNote = abstractInspire[i].value);
            break;
          }
        }
      }

      metaInspire.title = meta['titles'][0].title
      // metaInspire.authors = meta['authors']
      //document_type examples: ["book"], ["article"], ["article", "conference paper"], ["proceedings"], ["book chapter"]
      metaInspire.document_type = meta['document_type']
      // there are more than one citkeys for some items. take the first one
      metaInspire.citekey = meta['texkeys'][0]
      meta['isbns'] && (metaInspire.isbns = meta['isbns'].map((e: any) => e.value))
      if (meta['imprints']) {
        meta['imprints'][0].publisher && (metaInspire.publisher = meta['imprints'][0].publisher);
        meta['imprints'][0].date && (metaInspire.date = meta['imprints'][0].date)
      }

      metaInspire.title = meta['titles'][0].title

      const creators: any[] = [];
      /* INSPIRE tricky points:
      Not all items have 'author_count' in the metadata;
      some authors have only full_name, instead of last_name and first_name;
      some items even do not have `authors`
      */
      const metaCol = meta['collaborations']
      metaCol && (metaInspire.collaborations = metaCol.map((e: any) => e.value))

      const metaAuthors = meta['authors']
      if (metaAuthors) {
        const authorCount = meta['author_count'] || metaAuthors.length;
        let maxAuthorCount = authorCount;
        // // keep only 3 authors if there are more than 10
        // if (authorCount > 10) (maxAuthorCount = 3);

        const authorName = ["", ""]
        if (metaAuthors) {
          for (let j = 0; j < maxAuthorCount; j++) {
            const authorName = metaAuthors[j].full_name.split(', ')
            creators[j] = {
              firstName: authorName[1],
              lastName: authorName[0],
              creatorType: 'author'
            }
            metaAuthors[j].inspire_roles && (creators[j].creatorType = metaAuthors[j].inspire_roles[0])
          }
        }

        // if (authorCount > 10) {
        //   creators.push({
        //     name: 'others',
        //     creatorType: 'author'
        //   })
        // }
      } else if (metaCol) {
        for (let i = 0; i < metaCol.length; i++) {
          creators[i] = {
            name: metaInspire.collaborations[i],
            creatorType: "author"
          }
        }
      }

      metaInspire.creators = creators

      const t2 = performance.now();
      // Zotero.debug(`Assigning meta took ${t2 - t1} milliseconds.`)
    }
  } catch (err) {
    // Zotero.debug('getInspireMeta-err: Not found in INSPIRE')
    // Zotero.debug(`metaInspire: ${metaInspire}`)
    return -1;
  }

  // Zotero.debug("getInspireMeta final: ");
  // Zotero.debug(metaInspire)
  return metaInspire;
}

/*
copied from https://github.com/eschnett/zotero-citationcounts/blob/master/chrome/content/zotero-citationcounts.js
*/
async function getCrossrefCount(item: Zotero.Item) {
  const doi = item.getField('DOI');
  if (!doi) {
    // There is no DOI; skip item
    return -1;
  }
  const edoi = encodeURIComponent(doi);

  const t0 = performance.now();
  let response: any = null;

  if (response === null) {
    const style = "vnd.citationstyles.csl+json";
    const xform = "transform/application/" + style;
    const url = "https://api.crossref.org/works/" + edoi + "/" + xform;
    response = await fetch(url)
      .then(response => response.json())
      .catch(_err => null);
  }

  if (response === null) {
    const url = "https://doi.org/" + edoi;
    const style = "vnd.citationstyles.csl+json";
    response = await fetch(url, {
      headers: {
        "Accept": "application/" + style
      }
    })
      .then(response => response.json())
      .catch(_err => null);
  }

  if (response === null) {
    // Something went wrong
    return -1;
  }


  const t1 = performance.now();
  // Zotero.debug(`Fetching CrossRef meta took ${t1 - t0} milliseconds.`)

  let str = null;
  try {
    str = response['is-referenced-by-count'];
  } catch (err) {
    // There are no citation counts
    return -1;
  }

  const count = str ? parseInt(str) : -1;
  return count;
}

/**
 * Copied and modified from https://github.com/l0o0/jasminum/blob/main/src/modules/tools.ts
 */
async function getCNKICount(item: Zotero.Item) {
  let cite = "-1";
  const searchOption = {
    title: item.getField("title"),
    author: item.getCreators()[0].lastName + item.getCreators()[0].firstName,
    source: item.getField("publicationTitle"),
  };
  const searchResults = await searchCNKI(searchOption);
  if (searchResults && searchResults.length > 0) {
    for (let searchRes of searchResults) {
      // ztoolkit.log(`searchRes.title: ${searchRes.originTitle}`);
      // ztoolkit.log(`searchOption.title: ${searchOption.title}`);
      if (searchRes.originTitle === searchOption.title) {
        cite = (searchRes.citation as string) ? (searchRes.citation as string) : "-1";
        ztoolkit.log(`CNKI citation: ${cite}`);
        break;
      }
    }
  }
  return parseInt(cite);
}

async function setInspireMeta(item: Zotero.Item, metaInspire: jsobject, operation: string) {

  // const today = new Date(Date.now()).toLocaleDateString('zh-CN');
  let extra = item.getField('extra') as string;
  const publication = item.getField('publicationTitle') as string
  const citekey_pref = getPref("citekey")
  // item.setField('archiveLocation', metaInspire);
  if (metaInspire.recid !== -1 && metaInspire.recid !== undefined) {
    if (operation === 'full' || operation === 'noabstract') {
      item.setField('archive', "INSPIRE");
      item.setField('archiveLocation', metaInspire.recid);

      if (metaInspire.journalAbbreviation) {
        if (item.itemType === "journalArticle") { //metaInspire.document_type[0]  === "article"
          item.setField('journalAbbreviation', metaInspire.journalAbbreviation);
        } else if (metaInspire.document_type[0] === "book" && item.itemType === "book") {
          // Set series if there is none. 2025-2-6 by zhikaiyici
          !item.getField("series") && item.setField('series', metaInspire.journalAbbreviation)
        } else {
          // Set publicationTitle if there is none. 2025-2-6 by zhikaiyici
          !item.getField("publicationTitle") && item.setField('publicationTitle', metaInspire.journalAbbreviation)
        }
      }
      // to avoid setting undefined to zotero items
      if (metaInspire.volume) {
        // Set volume if there is none. 2025-2-6 by zhikaiyici
        (metaInspire.document_type[0] == "book") ? !item.getField("seriesNumber") && item.setField('seriesNumber', metaInspire.volume) : !item.getField("volume") && item.setField('volume', metaInspire.volume);
      }
      // Set pages if there is none. 2025-2-6 by zhikaiyici
      if (!item.getField("pages") && metaInspire.pages && (metaInspire.document_type[0] !== "book")) item.setField('pages', metaInspire.pages);
      // Set date/issue if there is none. 2025-2-6 by zhikaiyici
      !item.getField("date") && metaInspire.date && item.setField('date', metaInspire.date);
      !item.getField("issue") && metaInspire.issue && item.setField('issue', metaInspire.issue);
      if (metaInspire.DOI) {
        // if (metaInspire.document_type[0] === "book") {
        if (item.itemType === 'journalArticle' || item.itemType === 'preprint') {
          // Set doi if there is none. 2025-2-6 by zhikaiyici
          !item.getField("DOI") && item.setField('DOI', metaInspire.DOI);
        } else {
          // Set url if there is none. 2025-2-6 by zhikaiyici
          !item.getField("url") && item.setField('url', "https://doi.org/" + metaInspire.DOI)
        }
      }

      if (metaInspire.isbns && !item.getField('ISBN')) item.setField('ISBN', metaInspire.isbns);
      if (metaInspire.publisher && !item.getField('publisher') && (item.itemType == 'book' || item.itemType == "bookSection")) item.setField('publisher', metaInspire.publisher);

      /* set the title and creators if there are none */
      !item.getField('title') && item.setField('title', metaInspire.title)
      if (!item.getCreator(0)) item.setCreators(metaInspire.creators)

      // The current arXiv.org Zotero translator put all cross-listed categories after the ID, and the primary category is not the first. Here we replace that list by only the primary one.
      // set the arXiv url, useful to use Find Available PDF for newly added arXiv papers
      if (metaInspire.arxiv) {
        const arxivId = metaInspire.arxiv.value
        const _arxivReg = new RegExp(/^.*(arXiv:|_eprint:).*$(\n|)/mgi)
        let arXivInfo = ""
        if (/^\d/.test(arxivId)) {
          const arxivPrimeryCategory = metaInspire.arxiv.categories[0]
          arXivInfo = `arXiv:${arxivId} [${arxivPrimeryCategory}]`
        } else {
          arXivInfo = "arXiv:" + arxivId;
        }
        const numberOfArxiv = (extra.match(_arxivReg) || '').length
        // Zotero.debug(`number of arXiv lines: ${numberOfArxiv}`)
        if (numberOfArxiv !== 1) {
          // The arXiv.org translater could add two lines of arXiv to extra; remove one in that case
          extra = extra.replace(_arxivReg, '')
          // Zotero.debug(`extra w/o arxiv: ${extra}`)
          extra.endsWith('\n') ? extra += arXivInfo : extra += '\n' + arXivInfo;
          // Zotero.debug(`extra w/ arxiv: ${extra}`)
        } else {
          extra = extra.replace(/^.*(arXiv:|_eprint:).*$/mgi, arXivInfo);
          // Zotero.debug(`extra w arxiv-2: ${extra}`)
        }

        // set journalAbbr. to the arXiv ID prior to journal publication
        if (!metaInspire.journalAbbreviation) {
          item.itemType == 'journalArticle' && item.setField('journalAbbreviation', arXivInfo);
          publication.startsWith('arXiv:') && item.setField('publicationTitle', "")
        }
        const url = item.getField('url');
        (metaInspire.urlArxiv && !url) && item.setField('url', metaInspire.urlArxiv)
      }

      extra = extra.replace(/^.*type: article.*$\n/mg, '')

      if (metaInspire.collaborations && !extra.includes('tex.collaboration')) {
        extra = extra + "\n" + "tex.collaboration: " + metaInspire.collaborations.join(", ");
      }

      // Zotero.debug('setInspire-4')
      extra = setCitations(extra, metaInspire.citation_count, metaInspire.citation_count_wo_self_citations)

      // for erratum, added by FK Guo, date: 2023-08-27
      // Zotero.debug(`++++metaInspire.note: ${metaInspire.note}`)
      if (metaInspire.note && metaInspire.note !== "[]") {
        const noteIDs = item.getNotes()
        // check whether the same erratum note is already there
        let errTag = false
        for (const id of noteIDs) {
          const note = Zotero.Items.get(id);
          const noteHTML = note.getNote().replace('–', '-').replace('--', '-');
          if (noteHTML.includes(metaInspire.note)) {
            errTag = true
          }
          // Zotero.debug(`=======+++++++ ${id} : ${errTag}`)
        }
        if (!errTag) {
          const newNote = new Zotero.Item('note')
          newNote.setNote(metaInspire.note);
          newNote.parentID = item.id;
          await newNote.saveTx();
          newNote
        }
      }

      // for citekey preference
      if (citekey_pref === "inspire") {
        if (extra.includes('Citation Key')) {
          const initialCiteKey = (extra.match(/^.*Citation\sKey:.*$/mg) || "")[0].split(': ')[1]
          if (initialCiteKey !== metaInspire.citekey) extra = extra.replace(/^.*Citation\sKey.*$/mg, `Citation Key: ${metaInspire.citekey}`);
        } else {
          extra += "\nCitation Key: " + metaInspire.citekey
        }
      }

    };

    if (operation === "full" && metaInspire.abstractNote) {
      item.setField('abstractNote', metaInspire.abstractNote)
    };

    if (operation === "citations") {
      extra = setCitations(extra, metaInspire.citation_count, metaInspire.citation_count_wo_self_citations)
    }
    extra = extra.replace(/\n\n/mg, '\n')
    item.setField('extra', extra)

  }
}

function setExtraCitations(extra: any, source: string, citation_count: any) {
  const today = new Date(Date.now()).toLocaleDateString('zh-CN');
  // Zotero.debug(`setExtraCitations citation count: ${citation_count}`)
  // judge whether extra has the citation record
  if (/(|.*?\n)\d+\scitations?[\s\S]*?/.test(extra)) {
    const existingCitations = extra.match(/^\d+\scitations?/mg).map((e: any) => Number(e.replace(/\scitations?/g, "")))
    // if the citations are different, replace the old one 
    if (citation_count !== existingCitations[0]) {
      extra = extra.replace(/^.*citations?.*$\n?/mg, "");
      extra = `${citation_count} ${citation_count > 1 ? "citations" : "citation"} (${source} ${today})\n` + extra
    }
  } else {
    extra = `${citation_count} ${citation_count > 1 ? "citations" : "citation"} (${source} ${today})\n` + extra
  }
  return extra
}

async function setCrossRefCitations(item: Zotero.Item) {
  let extra = item.getField('extra')
  let count_crossref = await getCrossrefCount(item)
  if (count_crossref >= 0) {
    extra = setExtraCitations(extra, 'CrossRef', count_crossref) as string
    extra = extra.replace(/\n\n/mg, '\n')
    item.setField('extra', extra)
  } else {
    count_crossref = -1
  }
  return count_crossref
}

async function setCNKICitations(item: Zotero.Item) {
  let extra = item.getField('extra')
  let count_cnki = await getCNKICount(item)
  if (count_cnki >= 0) {
    extra = setExtraCitations(extra, 'CNKI', count_cnki) as string
    extra = extra.replace(/\n\n/mg, '\n')
    item.setField('extra', extra)
  } else {
    count_cnki = -1
  }
  return count_cnki
}

function setCitations(extra: string, citation_count: number, citation_count_wo_self_citations: number) {
  const today = new Date(Date.now()).toLocaleDateString('zh-CN');
  // judge whether extra has the two lines of citations
  if (/(|.*?\n)\d+\scitations?[\s\S]*?\n\d+[\s\S]*?w\/o\sself[\s\S]*?/.test(extra)) {
    const temp = extra.match(/^\d+\scitations?/mg)
    let existingCitations;
    if (temp !== null) {
      existingCitations = temp.map((e: any) => Number(e.replace(/\scitations?/g, "")));
    } else {
      existingCitations = [0, 0]
    }
    // Zotero.debug(`existing citations:  ${existingCitations}`)
    // if the citations are different, replace the old ones 
    // if (citation_count + citation_count_wo_self_citations !== existingCitations.reduce((a, b) => a + b)) {
    if (citation_count !== existingCitations[0] || citation_count_wo_self_citations !== existingCitations[1]) {
      extra = extra.replace(/^.*citations?.*$\n?/mg, "");
      extra = `${citation_count} ${citation_count > 1 ? "citations" : "citation"} (INSPIRE ${today})\n` + `${citation_count_wo_self_citations} ${citation_count_wo_self_citations > 1 ? "citations" : "citation"} w/o self (INSPIRE ${today})\n` + extra
    }
  } else {
    extra = `${citation_count} ${citation_count > 1 ? "citations" : "citation"} (INSPIRE ${today})\n` + `${citation_count_wo_self_citations} ${citation_count_wo_self_citations > 1 ? "citations" : "citation"} w/o self (INSPIRE ${today})\n` + extra
  }
  return extra
}
