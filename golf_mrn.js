//(function () {

	var WAIT_TAB = 500;

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

	// 클릭 직후 고정된 시간만 기다리면, AJAX가 아직 안 끝난 "로딩 중" DOM을
	// 그대로 읽어버려 스코어가 비거나 이전 화면 데이터가 섞이는 문제가 생긴다.
	// 두 번 연속으로 같은(그리고 비어있지 않은) 결과가 나올 때까지 폴링해서
	// 실제로 렌더링이 끝난 시점의 데이터만 신뢰한다.
	async function waitForStableRows(subTabName, maxRetries, waitMs) {
		maxRetries = maxRetries || 6;
		waitMs = waitMs || 250;

		var prevSig = null;

		for (var i = 0; i < maxRetries; i++) {
			await sleep(waitMs);

			var rows = collectCurrentRows(subTabName);
			var sig = rowsSignature(rows);

			if (rows.length > 0 && sig === prevSig) {
				return rows;
			}

			prevSig = sig;
		}

		console.warn(subTabName, "데이터 안정화 대기 시간 초과. 마지막 상태로 진행");

		return collectCurrentRows(subTabName);
	}

	async function movePageAndCollect(pageNo, subTabName, beforeRows) {
		var beforeSig = rowsSignature(beforeRows);

		for (var retry = 0; retry < 3; retry++) {
			clickPageNo(pageNo);

			var afterRows = await waitForStableRows(subTabName);
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

		// 이전 실행에서 남은 페이지 상태(2페이지 이상에 머물러 있는 등)가
		// 남아있을 수 있으므로, 수집 시작 전 반드시 1페이지로 되돌린다.
		if (findPageLink(1)) {
			console.log(subTabName, "1페이지로 초기화");
			clickPageNo(1);
		}

		var currentRows = await waitForStableRows(subTabName);

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

	function getDefaultViewLabel() {
		// con_multiple(多기록) / con_distance(롱기니어) / con_holeinone(홀인원)은
		// 같은 라디오 그룹에 속한 보기 전환 버튼이라고 가정하고, 그 그룹에서
		// 우리가 알고 있는 3개를 제외한 나머지(=기본 "전체기록" 보기)를 찾는다.
		var knownIds = ["con_multiple", "con_distance", "con_holeinone"];

		var refInput = $("#con_multiple");

		if (refInput.length === 0) {
			refInput = $("#con_distance");
		}

		if (refInput.length === 0) {
			refInput = $("#con_holeinone");
		}

		if (refInput.length === 0) {
			return null;
		}

		var groupName = refInput.attr("name");

		if (!groupName) {
			return null;
		}

		var defaultInput = $("input[name='" + groupName + "']").filter(function () {
			return knownIds.indexOf($(this).attr("id")) === -1;
		}).first();

		if (defaultInput.length === 0) {
			return null;
		}

		var defaultId = defaultInput.attr("id");

		if (!defaultId) {
			return null;
		}

		return $("label[for='" + defaultId + "']");
	}

	async function resetToDefaultView() {
		// 스크립트를 재실행했을 때, 직전 실행이 마지막으로 클릭해둔
		// 多기록/롱기니어/홀인원 보기가 그대로 남아있으면 정상 스코어 테이블
		// (.record_td)이 아닌 다른 화면을 읽어와 데이터가 꼬인다.
		// 수집을 시작하기 전에 항상 기본(전체기록) 보기로 되돌려 초기화한다.
		var defaultLabel = getDefaultViewLabel();

		if (!defaultLabel || defaultLabel.length === 0) {
			console.warn("기본(전체기록) 보기 라디오를 찾지 못해 초기화를 건너뜁니다.");
			return;
		}

		console.log("보기 초기화: 기본(전체기록) 보기로 되돌림");

		defaultLabel[0].click();

		await sleep(800);
	}

	// 라디오(보기) 전환 직후 고정 시간만 기다리면, 해당 화면의 데이터가
	// 아직 로드되기 전(빈 값)인 상태를 그대로 읽어버릴 수 있다.
	// checkFn이 true를 반환할 때까지(=데이터가 실제로 나타날 때까지) 폴링해서
	// 니어/롱기/홀인원 같은 화면도 수집이 끝까지 끝난 뒤에 다음 단계로 넘어가게 한다.
	async function waitUntil(checkFn, maxRetries, waitMs) {
		maxRetries = maxRetries || 6;
		waitMs = waitMs || 250;

		for (var i = 0; i < maxRetries; i++) {
			await sleep(waitMs);

			if (checkFn()) {
				return true;
			}
		}

		return checkFn();
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

		await waitUntil(function () {
			return $(".multi_play").find("table tbody tr").length > 0;
		});

		var birdieBox = $(".multi_play").filter(function () {
			return $(this).find("h4").first().text().replace(/\s+/g, "").indexOf("버디") > -1;
		}).first();

		if (birdieBox.length === 0) {
			console.warn("多버디 영역 없음");
			return buddyRows;
		}

		birdieBox.find("table tbody tr").each(function () {
			// 내 스코어 강조행(my_score_tab)은 순위표와 중복되므로 수집에서 제외
			if ($(this).hasClass("my_score_tab") || $(this).find(".my_score_tab").length > 0) {
				return;
			}

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

		// 롱기 / 니어 수집
		var distanceLabel = $("label[for='con_distance']");

		if (distanceLabel.length > 0) {
			console.log("롱기/니어 클릭");

			distanceLabel[0].click();

			await waitUntil(function () {
				return $(".left").find(".total_score").eq(0).text().trim() !== "" ||
					$(".right").find(".total_score").eq(0).text().trim() !== "";
			});

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
		} else {
			console.warn("롱기/니어 label 없음");
		}

		// 홀인원 수집
		var holeinoneLabel = $("label[for='con_holeinone']");

		if (holeinoneLabel.length > 0) {
			console.log("홀인원 클릭");

			holeinoneLabel[0].click();

			await waitUntil(function () {
				return $("section").eq(2).find("table tbody tr").length > 0;
			});

			var holeSection = $("section").eq(2);

			holeSection.find("table tbody tr").each(function (idx, item) {
				var cols = [];
				
				
				$(this).find("td").each(function () {
					var txt = $(this).text().replace(/\s+/g, " ").trim();

					if (txt !== "") {
						cols.push(txt);
					}
				});

				if (cols.length > 0) {
					lnw.push({
						type: "HOLEINONE",
						label: "홀인원",
						nick: "",
						value: cols.join(" | ")
					});
				}
			});
		} else {
			console.warn("홀인원 label 없음");
		}

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

		function getLnwText(tab, type, fixedRows) {
			var arr = [];

			(tab.lnw || []).forEach(function (item) {
				if (item.type === type) {
					if (item.nick !== "") {
						arr.push(item.nick + " " + item.value);
					} else {
						arr.push(item.value);
					}
				}
			});

			if (fixedRows) {

				if (arr.length > fixedRows) {
					arr = arr.slice(0, fixedRows);
				}

				while (arr.length < fixedRows) {
					arr.push("&nbsp;");
				}
			}

			return arr.join("<br>");
		}

		var html = "";

		html += "<table id='MRN_TABLE2' border='1' style='border-collapse:collapse; font-size:12px; margin-bottom:8px;'>";

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

for (var holeIdx = 0; holeIdx < 3; holeIdx++) {

    html += "<tr>";

    if (holeIdx === 0) {
        html += "<td rowspan='3'>홀인원</td>";
    }

    courseTabs.forEach(function (tab) {

        var holeList = [];

        (tab.lnw || []).forEach(function (item) {
            if (item.type === "HOLEINONE") {
                holeList.push(item.value);
            }
        });

        html += "<td>";

        if (holeIdx < holeList.length) {
            html += holeList[holeIdx];
        }

        html += "</td>";
    });

    html += "</tr>";
}

		html += "</tr>";

		html += "</table>";

		return html;
	}

	async function collectSingleCourse() {
		// 코스가 1개뿐이라 .gft_sub_tab 자체가 없는 대회.
		// "합산" 탭 개념이 없으므로 스코어 컬럼(td:eq(4)) 기준으로 바로 수집한다.
		console.log("탭 없음: 코스 1개 대회로 판단, 현재 페이지에서 바로 수집");

		var subTabName = "스코어";

		await resetToDefaultView();

		var rows = await collectPages(subTabName);
		var lnw = await collectLnwRowsFromCourseTab();
		var buddyRows = await collectBuddyRowsFromTotalTab();

		return {
			tabResults: [{
				name: subTabName,
				rows: rows,
				lnw: lnw
			}],
			buddyRows: buddyRows
		};
	}

	async function collectTabs() {
		var tabs = $(".gft_sub_tab ul li a").toArray();

		if (tabs.length === 0) {
			return await collectSingleCourse();
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

			await resetToDefaultView();

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

	function getNearValueForNick(tab, nick) {
		var match = (tab.lnw || []).filter(function (item) {
			return item.type === "NEAR" && item.nick === nick;
		})[0];

		return match ? match.value : "";
	}

	function drawOneTable(result, collectStartTime) {
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
			html += "<td colspan='3'>" + tab.name + "</td>";
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
			html += "<td>니어</td>";
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
					html += "<td>" + getNearValueForNick(tab, row.nick) + "</td>";
				} else {
					html += "<td></td><td></td><td></td>";
				}
			});

			html += "</tr>";
		}

		html += "</table>";

		var mainHtml = "";

		mainHtml += "<div>" + $(".glf_detail_info h3").text().trim() + "</div>";
		mainHtml += "<div>대회기간:" + $(".status").text().trim() + "</div>";
		mainHtml += "<div>조회일시:" + collectStartTime.toLocaleString('sv') + "</div>";

		mainHtml += makeLnwTable(tabResults);
		mainHtml += html;

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
