//(function () {

    var WAIT_TAB = 1200;
    var WAIT_PAGE = 1500;
    var WAIT_CHANGE_TIMEOUT = 5000;

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            if (window.jQuery) {
                resolve();
                return;
            }

            var script = document.createElement("script");
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function cleanNick(nick) {
        nick = (nick || "").trim();

        if (nick.indexOf("(") > -1) {
            nick = nick.substring(0, nick.indexOf("("));
        }

        return nick.trim();
    }

    function getActiveTabName() {
        return $(".gft_sub_tab").find(".on").text().trim();
    }

    function getPageArea() {
        if ($("#divpagearea").length > 0) {
            return $("#divpagearea");
        }

        return $("#miniround_paging");
    }

    function getCurrentTableSignature() {
        var arr = [];

        $(".record_td tr").each(function () {
            arr.push($(this).text().replace(/\s+/g, "").trim());
        });

        return arr.join("|");
    }

    function collectCurrentRows(subTabName) {
        var rows = [];

        $(".record_td tr").each(function () {
            var nick = $(this).find("td:eq(1)").text().trim();
            var roundCnt = $(this).find("td:eq(2)").text().trim();
            var score = $(this).find("td:eq(4)").text().trim();

            nick = cleanNick(nick);

            if (nick !== "") {
                rows.push({
                    nick: nick,
                    value: subTabName === "합산" ? roundCnt : score
                });
            }
        });

        return rows;
    }

    function getPageNumbers() {
        var nums = [];

        getPageArea().find("a").each(function () {
            var txt = $(this).text().trim();

            if (txt !== "" && !isNaN(txt)) {
                nums.push(parseInt(txt, 10));
            }
        });

        nums = nums.filter(function (v, i, arr) {
            return arr.indexOf(v) === i;
        });

        nums.sort(function (a, b) {
            return a - b;
        });

        return nums;
    }

    function findPageLink(pageNo) {
        var found = null;

        getPageArea().find("a").each(function () {
            var txt = $(this).text().trim();

            if (txt === String(pageNo)) {
                found = this;
                return false;
            }
        });

        return found;
    }

    function clickPageNo(pageNo) {
        var page = findPageLink(pageNo);

        if (!page) {
            console.warn("페이지 링크 없음:", pageNo);
            return false;
        }

        console.log("페이지 클릭:", pageNo);
        page.click();

        return true;
    }

    async function waitTableChanged(beforeSignature) {
        var start = Date.now();

        while (Date.now() - start < WAIT_CHANGE_TIMEOUT) {
            await sleep(200);

            var nowSignature = getCurrentTableSignature();

            if (nowSignature !== "" && nowSignature !== beforeSignature) {
                return true;
            }
        }

        return false;
    }

    async function movePageAndCollect(pageNo, subTabName) {
        var beforeSignature = getCurrentTableSignature();

        var clicked = clickPageNo(pageNo);

        if (!clicked) {
            return [];
        }

        await sleep(WAIT_PAGE);

        var changed = await waitTableChanged(beforeSignature);

        if (!changed) {
            console.warn(subTabName + " " + pageNo + "페이지 변경 감지 실패. 재시도");

            beforeSignature = getCurrentTableSignature();

            clickPageNo(pageNo);

            await sleep(WAIT_PAGE);

            changed = await waitTableChanged(beforeSignature);
        }

        if (!changed) {
            console.warn(subTabName + " " + pageNo + "페이지 변경 실패. 중복 방지로 skip");
            return [];
        }

        var rows = collectCurrentRows(subTabName);

        console.log("수집:", subTabName, pageNo + "페이지", rows.length + "건");

        return rows;
    }

    async function collectPages(subTabName) {
        var rows = [];

        await sleep(300);

        var page1Rows = collectCurrentRows(subTabName);

        console.log("수집:", subTabName, "1페이지", page1Rows.length + "건");

        rows = rows.concat(page1Rows);

        var pageNumbers = getPageNumbers();

        for (var i = 0; i < pageNumbers.length; i++) {
            var pageNo = pageNumbers[i];

            if (pageNo === 1) continue;

            var pageRows = await movePageAndCollect(pageNo, subTabName);

            rows = rows.concat(pageRows);
        }

        return rows;
    }

	async function collectBuddyRowsFromTotalTab() {
		var buddyRows = [];

		var multiLabel = $("label[for='con_multiple']");

		if (multiLabel.length === 0) {
			console.warn("多기록 label 없음");
			return buddyRows;
		}

		console.log("多기록 클릭");

		multiLabel[0].click();

		await sleep(1000);

		var birdieBox = $(".multi_play").filter(function () {
			return $(this).find("h4").first().text().replace(/\s+/g, "").indexOf("버디") > -1;
		}).first();

		if (birdieBox.length === 0) {
			console.warn("多버디 영역 없음");
			return buddyRows;
		}

		birdieBox.find("table tbody tr").each(function () {
			var nick = $(this).find("td:eq(1) span").first().text().trim();
			var birdieCnt = $(this).find("td.round_count strong").first().text().trim();

			nick = cleanNick(nick);

			if (nick !== "" && birdieCnt !== "") {
				buddyRows.push({
					nick: nick,
					value: birdieCnt
				});
			}
		});

		console.log("버디 수집:", buddyRows.length + "건", buddyRows);

		return buddyRows;
	}

    async function collectTabs() {
        var tabs = $(".gft_sub_tab ul li a").toArray();

        if (tabs.length === 0) {
            alert("탭을 찾지 못했습니다.");
            return {
                tabResults: [],
                buddyRows: []
            };
        }

        var orderedTabs = tabs.slice(1).concat(tabs.slice(0, 1));

        var tabResults = [];
        var buddyRows = [];

        for (var i = 0; i < orderedTabs.length; i++) {
            var tabId = $(orderedTabs[i]).attr("id");

            if (!tabId) continue;

            console.log("탭 클릭:", tabId);

            document.getElementById(tabId).click();

            await sleep(WAIT_TAB);

            var subTabName = getActiveTabName();

            console.log("현재 탭:", subTabName);

            var rows = await collectPages(subTabName);

            if (subTabName === "합산") {
                buddyRows = await collectBuddyRowsFromTotalTab();
            }

            tabResults.push({
                name: subTabName,
                rows: rows
            });
        }

        return {
            tabResults: tabResults,
            buddyRows: buddyRows
        };
    }

    function drawOneTable(result) {
        $("#MRN").empty();

        var tabResults = result.tabResults || [];
        var buddyRows = result.buddyRows || [];

        var maxRow = 0;

        tabResults.forEach(function (tab) {
            if (tab.rows.length > maxRow) {
                maxRow = tab.rows.length;
            }
        });

        if (buddyRows.length > maxRow) {
            maxRow = buddyRows.length;
        }

        var html = "";

        html += "<table id='MRN_TABLE' border='1' style='border-collapse:collapse; font-size:12px;'>";
        html += "<tr>";
        html += "<td rowspan='2'>순번</td>";

        tabResults.forEach(function (tab) {
            html += "<td colspan='2'>" + tab.name + "</td>";
        });

        html += "<td colspan='2'>多기록</td>";
        html += "</tr>";

        html += "<tr>";

        tabResults.forEach(function (tab) {
            html += "<td>별명</td>";
            html += "<td>" + (tab.name === "합산" ? "라운드수" : tab.name) + "</td>";
        });

        html += "<td>별명</td>";
        html += "<td>버디갯수</td>";
        html += "</tr>";

        for (var i = 0; i < maxRow; i++) {
            html += "<tr>";
            html += "<td>" + (i + 1) + "</td>";

            tabResults.forEach(function (tab) {
                var row = tab.rows[i];

                if (row) {
                    html += "<td>" + row.nick + "</td>";
                    html += "<td>" + row.value + "</td>";
                } else {
                    html += "<td></td><td></td>";
                }
            });

            var buddy = buddyRows[i];

            if (buddy) {
                html += "<td>" + buddy.nick + "</td>";
                html += "<td>" + buddy.value + "</td>";
            } else {
                html += "<td></td><td></td>";
            }

            html += "</tr>";
        }

        html += "</table>";

        $("#MRN").append(html);
		$("#MRN_TABLE").before("<div>"+$(".detail_info h3").text()+"</div>"	//대회제목추가
				+"<div>\'"+new Date().toLocaleString('sv')+"</div>"	//조회일시추가
				); 
		
		
		document.getElementById("MRN_TABLE").scrollIntoView({
		    behavior: "smooth",
		    block: "start"
		});
    }

    async function start() {
        await loadScript("https://code.jquery.com/jquery-3.7.1.min.js");

        if ($("#MRN").length === 0) {
            $("#ranking_list").append("<div id='MRN'></div>");
        } else {
            $("#MRN").empty();
        }

        $("#MRN").append("<div>데이터 수집 중...</div>");

        var result = await collectTabs();

        drawOneTable(result);

        console.log("전체 수집 완료", result);
    }

    start().catch(function (e) {
        console.error("실행 오류:", e);
        alert("실행 중 오류 발생. 콘솔을 확인하세요.");
    });

//})();
