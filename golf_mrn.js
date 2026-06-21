//(function () {

	var WAIT_TAB = 500;
	var WAIT_PAGE = 500;
	var WAIT_CHANGE_TIMEOUT = 1200;

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

	function rowsSignature(rows) {
		return rows.map(function (r) {
			return r.nick + "|" + r.value;
		}).join("||");
	}

	async function movePageAndCollect(pageNo, subTabName, beforeRows) {
		var beforeSig = rowsSignature(beforeRows);

		for (var retry = 0; retry < 3; retry++) {
			clickPageNo(pageNo);

			await sleep(WAIT_PAGE);

			var afterRows = collectCurrentRows(subTabName);
			var afterSig = rowsSignature(afterRows);

			if (afterRows.length > 0 && afterSig !== beforeSig) {
				console.log(
					"수집:",
					subTabName,
					pageNo + "페이지",
					afterRows.length + "건",
					"retry=" + retry
				);

				return afterRows;
			}

			console.warn(
				subTabName,
				pageNo + "페이지 데이터 동일. 재시도",
				retry + 1
			);

			await sleep(300);
		}

		console.warn(
			subTabName,
			pageNo + "페이지 최종 실패. 중복 방지로 skip"
		);

		return [];
	}

	async function collectPages(subTabName) {
		var rows = [];

		await sleep(300);

		var currentRows = collectCurrentRows(subTabName);

		console.log("수집:", subTabName, "1페이지", currentRows.length + "건");

		rows = rows.concat(currentRows);

		var pageNumbers = getPageNumbers();

		for (var i = 0; i < pageNumbers.length; i++) {
			var pageNo = pageNumbers[i];

			if (pageNo === 1) continue;

			var pageRows = await movePageAndCollect(
				pageNo,
				subTabName,
				currentRows
			);

			if (pageRows.length > 0) {
				rows = rows.concat(pageRows);
				currentRows = pageRows;
			}
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

	async function collectLnwRowsFromCourseTab() {
		var lnw = [];

		var distanceLabel = $("label[for='con_distance']");

		if (distanceLabel.length === 0) {
			console.warn("롱기/니어 label 없음");
			return lnw;
		}

		console.log("롱기/니어 클릭");

		distanceLabel[0].click();

		await sleep(1000);

		var longNick = cleanNick(
			$(".left").find(".client_nick.incell_tbl").eq(0).text()
		);

		var longValue = $(".left").find(".total_score").eq(0).text().trim();

		if (longNick !== "" || longValue !== "") {
			lnw.push({
				type: "LONG",
				label: "롱기",
				nick: longNick,
				value: longValue
			});
		}

		var nearNick = cleanNick(
			$(".right").find(".client_nick.incell_tbl").eq(0).text()
		);

		var nearValue = $(".right").find(".total_score").eq(0).text().trim();

		if (nearNick !== "" || nearValue !== "") {
			lnw.push({
				type: "NEAR",
				label: "니어",
				nick: nearNick,
				value: nearValue
			});
		}

		/*
			홀인원 추가 시 여기에 con_holeinone 클릭 후 아래 형태로 push.

			lnw.push({
				type: "HOLEINONE",
				label: "홀인원",
				nick: nick,
				value: holeInfo
			});
		*/

		console.log("롱니홀 수집:", lnw);

		return lnw;
	}

	function makeLnwTable(tabResults) {
		var courseTabs = tabResults.filter(function (tab) {
			return tab.name !== "합산";
		});

		if (courseTabs.length === 0) {
			return "";
		}

		function getLnwText(tab, type) {
			var text = "";

			(tab.lnw || []).forEach(function (item) {
				if (item.type === type) {
					text = item.nick + " " + item.value;
				}
			});

			return text;
		}

		var html = "";

		html += "<table id='MRN_TABLE2' border='1' style='border-collapse:collapse; font-size:12px; white-space:nowrap;'>";

		html += "<tr>";
		html += "<td>종류</td>";

		courseTabs.forEach(function (tab) {
			html += "<td>" + tab.name + "</td>";
		});

		html += "</tr>";

		html += "<tr>";
		html += "<td>롱기</td>";

		courseTabs.forEach(function (tab) {
			html += "<td>" + getLnwText(tab, "LONG") + "</td>";
		});

		html += "</tr>";

		html += "<tr>";
		html += "<td>니어</td>";

		courseTabs.forEach(function (tab) {
			html += "<td>" + getLnwText(tab, "NEAR") + "</td>";
		});

		html += "</tr>";

		html += "<tr>";
		html += "<td>홀인원</td>";

		courseTabs.forEach(function (tab) {
			html += "<td>" + getLnwText(tab, "HOLEINONE") + "</td>";
		});

		html += "</tr>";

		html += "</table>";

		return html;
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
			var lnw = [];

			if (subTabName === "합산") {
				buddyRows = await collectBuddyRowsFromTotalTab();
			} else {
				lnw = await collectLnwRowsFromCourseTab();
			}

			tabResults.push({
				name: subTabName,
				rows: rows,
				lnw: lnw
			});
		}

		return {
			tabResults: tabResults,
			buddyRows: buddyRows
		};
	}

	function drawOneTable(result, drawOneTable) {
		$("#MRN").empty();

		var tabResults = result.tabResults || [];
		var buddyRows = result.buddyRows || [];

		var totalTab = tabResults.filter(function (tab) {
			return tab.name === "합산";
		})[0];

		var otherTabs = tabResults.filter(function (tab) {
			return tab.name !== "합산";
		});

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

		if (totalTab) {
			html += "<td colspan='2'>합산</td>";
		}

		html += "<td colspan='2'>多기록</td>";

		otherTabs.forEach(function (tab) {
			html += "<td colspan='2'>" + tab.name + "</td>";
		});

		html += "</tr>";

		html += "<tr>";

		if (totalTab) {
			html += "<td>별명</td>";
			html += "<td>라운드수</td>";
		}

		html += "<td>별명</td>";
		html += "<td>버디갯수</td>";

		otherTabs.forEach(function (tab) {
			html += "<td>별명</td>";
			html += "<td>" + tab.name + "</td>";
		});

		html += "</tr>";

		for (var i = 0; i < maxRow; i++) {
			html += "<tr>";
			html += "<td>" + (i + 1) + "</td>";

			if (totalTab) {
				var totalRow = totalTab.rows[i];

				if (totalRow) {
					html += "<td>" + totalRow.nick + "</td>";
					html += "<td>" + totalRow.value + "</td>";
				} else {
					html += "<td></td><td></td>";
				}
			}

			var buddy = buddyRows[i];

			if (buddy) {
				html += "<td>" + buddy.nick + "</td>";
				html += "<td>" + buddy.value + "</td>";
			} else {
				html += "<td></td><td></td>";
			}

			otherTabs.forEach(function (tab) {
				var row = tab.rows[i];

				if (row) {
					html += "<td>" + row.nick + "</td>";
					html += "<td>" + row.value + "</td>";
				} else {
					html += "<td></td><td></td>";
				}
			});

			html += "</tr>";
		}

		html += "</table>";

		var mainHtml = "";

		mainHtml += "<div>" + $(".glf_detail_info h3").text() + "</div>";
		mainHtml += "<div>대회기간:" + $(".status").text().trim() + "</div>";
		mainHtml += "<div>조회일시:" + drawOneTable.toLocaleString('sv') + "</div>";

		mainHtml += "<div id='MRN_WRAP' "
				 + "style='display:flex; flex-wrap:nowrap; align-items:flex-start; gap:10px; margin-top:5px;'>";

		mainHtml += html;
		mainHtml += makeLnwTable(tabResults);

		mainHtml += "</div>";

		$("#MRN").append(mainHtml);
		

		document.getElementById("MRN_TABLE2").scrollIntoView({
			behavior: "smooth",
			block: "start"
		});
	}

	async function start() {
		 var collectStartTime = new Date();
		 
		await loadScript("https://code.jquery.com/jquery-3.7.1.min.js");

		if ($("#MRN").length === 0) {
			$("#ranking_list").append("<div id='MRN'></div>");
		} else {
			$("#MRN").empty();
		}

		$("#MRN").append("<div>데이터 수집 중...</div>");

		var result = await collectTabs();

		drawOneTable(result, collectStartTime);

		console.log("전체 수집 완료", result);
	}

	start().catch(function (e) {
		console.error("실행 오류:", e);
		alert("실행 중 오류 발생. 콘솔을 확인하세요.");
	});

//})();
