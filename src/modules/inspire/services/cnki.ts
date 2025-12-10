/**
 * Copied and modified from https://github.com/l0o0/jasminum/blob/main/src/modules/services/cnki.ts
 */
import { DocTools, jsonToFormUrlEncoded, text2HTMLDoc } from "../../../utils/http";
// import { getPref } from "../../utils/prefs";

/**
 * Create post data for CNKI search.
 * @param searchOption
 * @returns
 */
function createSearchPostOptions(searchOption: SearchOption) {
    let url;
    let headers;
    // SU may find more results than TI. SU %= | TI %=
    let searchExp: string;
    searchOption.title = searchOption.title.replace(/<\/?(sub|sup|b|i|span[^>]*)>/g, "");
    if (searchOption.title.includes(" ")) {
        // 过滤掉短的主题词，可以避免出现大量无关结果
        const titleParts = searchOption.title
            .split(" ")
            .filter((i) => i.length > 4);
        searchExp =
            "(TI %= " +
            titleParts.map((_i) => `'${_i}'`).join(" % ") +
            " OR SU %= " +
            titleParts.join("+") +
            ")";
    } else {
        searchExp = `TI %= '${searchOption.title}'`;
    }
    if (searchOption.author)
        searchExp = searchExp + ` AND AU='${searchOption.author}'`;
    if (searchOption.source)
        searchExp = searchExp + ` AND LY='${searchOption.source}'`;
    ztoolkit.log("Search expression: ", searchExp);
    const searchExpAside = searchExp.replace(/'/g, "&#39;");
    let queryJson;
    if (true/*getPref("isMainlandChina")*/) {
        ztoolkit.log("CNKI in mainland China.");
        url = "https://kns.cnki.net/kns8s/brief/grid";
        headers = {
            Host: "kns.cnki.net",
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/133.0",
            Accept: "*/*",
            "Accept-Language": "zh-CN,en-US;q=0.7,en;q=0.3",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Origin: "https://kns.cnki.net",
            Referer:
                "https://kns.cnki.net/kns8s/AdvSearch?crossids=YSTT4HG0%2CLSTPFY1C%2CJUP3MUPD%2CMPMFIG1A%2CWQ0UVIAA%2CBLZOG7CK%2CPWFIRAGL%2CEMRPGLPA%2CNLBO1Z6R%2CNN3FJMUV",
        };
        queryJson = {
            boolSearch: "true",
            QueryJson: {
                Platform: "",
                Resource: "CROSSDB",
                Classid: "WD0FTY92",
                Products: "",
                QNode: {
                    QGroup: [
                        {
                            Key: "Subject",
                            Title: "",
                            Logic: 0,
                            Items: [
                                {
                                    Key: "Expert",
                                    Title: "",
                                    Logic: 0,
                                    Field: "EXPERT",
                                    Operator: 0,
                                    Value: searchExp,
                                    Value2: "",
                                },
                            ],
                            ChildItems: [],
                        },
                        {
                            Key: "ControlGroup",
                            Title: "",
                            Logic: 0,
                            Items: [],
                            ChildItems: [],
                        },
                    ],
                },
                ExScope: "1",
                SearchType: 4,
                Rlang: "CHINESE",
                KuaKuCode:
                    "YSTT4HG0,LSTPFY1C,JUP3MUPD,MPMFIG1A,WQ0UVIAA,BLZOG7CK,PWFIRAGL,EMRPGLPA,NLBO1Z6R,NN3FJMUV",
                SearchFrom: 1,
            },
            pageNum: "1",
            pageSize: "20",
            sortField: "",
            sortType: "",
            dstyle: "listmode",
            productStr:
                "YSTT4HG0,LSTPFY1C,RMJLXHZ3,JQIRZIYA,JUP3MUPD,1UR4K4HZ,BPBAFJ5S,R79MZMCB,MPMFIG1A,WQ0UVIAA,NB3BWEHK,XVLO76FD,HR1YT1Z9,BLZOG7CK,PWFIRAGL,EMRPGLPA,J708GVCE,ML4DRIDX,NLBO1Z6R,NN3FJMUV,",
            aside: `(${searchExpAside})`,
            searchFrom: "资源范围：总库;++中英文扩展;++时间范围：更新时间：不限;++",
            CurPage: "1",
        };
    } else {
        ztoolkit.log("Using CNKI oversea.");
        url = "https://chn.oversea.cnki.net/kns/Brief/GetGridTableHtml";
        headers = {
            Host: "chn.oversea.cnki.net",
            Referer:
                "https://chn.oversea.cnki.net/kns/AdvSearch?dbcode=CFLS&crossDbcodes=CJFQ,CDMD,CIPD,CCND,CYFD,CCJD,BDZK,CISD,CJFQ,CDMD,CIPD,CCND,CYFD,CCJD,BDZK,CISD,CJFN",
        };
        queryJson = {
            IsSearch: "true",
            QueryJson: {
                Platform: "",
                DBCode: "CFLS",
                KuaKuCode:
                    "CJFQ,CDMD,CIPD,CCND,CYFD,CCJD,BDZK,CISD,CJFQ,CDMD,CIPD,CCND,CYFD,CCJD,BDZK,CISD,CJFN",
                QNode: {
                    QGroup: [
                        {
                            Key: "Subject",
                            Title: "",
                            Logic: 4,
                            Items: [
                                {
                                    Key: "Expert",
                                    Title: "",
                                    Logic: 0,
                                    Name: "",
                                    Operate: "",
                                    Value: searchExp,
                                    ExtendType: 12,
                                    ExtendValue: "中英文对照",
                                    Value2: "",
                                    BlurType: "",
                                },
                            ],
                            ChildItems: [],
                        },
                        {
                            Key: "ControlGroup",
                            Title: "",
                            Logic: 1,
                            Items: [],
                            ChildItems: [],
                        },
                    ],
                },
                ExScope: 1,
                CodeLang: "",
            },
            PageName: "AdvSearch",
            DBCode: "CFLS",
            KuaKuCodes:
                "CJFQ,CDMD,CIPD,CCND,CYFD,CCJD,BDZK,CISD,CJFQ,CDMD,CIPD,CCND,CYFD,CCJD,BDZK,CISD,CJFN",
            CurPage: "1",
            RecordsCntPerPage: "20",
            CurDisplayMode: "listmode",
            CurrSortField: "",
            CurrSortFieldType: "desc",
            IsSentenceSearch: "false",
            Subject: "",
        };
    }
    // ztoolkit.log(queryJson);
    // ztoolkit.log(jsonToFormUrlEncoded(queryJson));
    return {
        url: url,
        data: jsonToFormUrlEncoded(queryJson),
        headers: headers,
    };
}

async function searchWeb(searchOption: SearchOption) {
    ztoolkit.log("serch options: ", searchOption);
    const postOption = createSearchPostOptions(searchOption);
    const resp = await Zotero.HTTP.request("POST", postOption.url, {
        headers: postOption.headers,
        body: postOption.data,
    });
    // TODO
    // Need to handle some HTTP request ERROR
    // ztoolkit.log(resp.responseText);
    const searchDoc = text2HTMLDoc(resp.responseText);
    const resultRows = searchDoc.querySelectorAll(
        "table.result-table-list > tbody > tr",
    );
    ztoolkit.log(`CNKI search result: ${resultRows.length}`);
    return resultRows;
}

export async function searchCNKI(searchOption: SearchOption,): Promise<ScrapeSearchResult[] | null> {
    // ztoolkit.log("serch options: ", searchOption);
    // const postOption = createSearchPostOptions(searchOption);
    // const resp = await Zotero.HTTP.request("POST", postOption.url, {
    //     headers: postOption.headers,
    //     body: postOption.data,
    // });
    // // TODO
    // // Need to handle some HTTP request ERROR
    // // ztoolkit.log(resp.responseText);
    // const searchDoc = text2HTMLDoc(resp.responseText);
    // const resultRows = searchDoc.querySelectorAll(
    //     "table.result-table-list > tbody > tr",
    // );
    // ztoolkit.log(`CNKI search result: ${resultRows.length}`);
    let resultRows = await searchWeb(searchOption);
    if (resultRows.length == 0) {
        ztoolkit.log("CNKI no items found after the first search.");
        searchOption.author = "";
        resultRows = await searchWeb(searchOption)
    }
    if (resultRows.length == 0) {
        ztoolkit.log("CNKI no items found.");
        return null;
    } else {
        const resultData = Array.from(resultRows).map((r) => {
            const dt = new DocTools(r as HTMLElement);
            let url = dt.attr("a.fz14", "href")!;
            // Missing host in CNKI oversea.
            if (!url.startsWith("http")) {
                url = "https://chn.oversea.cnki.net" + url;
            }
            const title = ` ${dt.innerText("td.seq")} ${dt.innerText("td.data")} ${dt.innerText("td.name a")} ${dt.innerText("td.author").replace(" ", ",")} ${dt.innerText("td.source")} ${dt.innerText("td.date")}`;
            return {
                source: "CNKI",
                title: title,
                originTitle: dt.innerText("td.name a"),
                url: url,
                date: Zotero.Date.strToISO(dt.innerText("td.date")) || "",
                netFirst: dt.innerText("td.name > b.marktip"),
                citation: dt.innerText("td.quote"),
                exportID: dt.attr("td.seq input", "value"),
                dbname: dt.attr("td.operat > [data-dbname]", "data-dbname"),
                filename: dt.attr("td.operat > [data-dbname]", "data-filename"),
            };
        });
        return resultData;
    }
}