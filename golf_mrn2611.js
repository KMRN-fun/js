//(function () {

	var WAIT_TAB = 500;

	// 어떤 버전이 실행됐는지 화면에서 확인하기 위한 표기 (수정할 때마다 올려주세요)
	var MRN_VERSION = "2611-v9";

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

	function toInt(v) {
		var n = parseInt(String(v).replace(/[^\d\-+]/g, ""), 10);
		return isNaN(n) ? null : n;
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

			// 전체 td 텍스트도 보관 (합산 탭의 스트로크/보정치/최종스코어 확인용)
			var cells = [];
			$(this).find("td").each(function () {
				cells.push($(this).text().replace(/\s+/g, " ").trim());
			});

			nick = cleanNick(nick);

			if (nick !== "") {
				rows.push({
					nick: nick,
					value: subTabName === "합산" ? roundCnt : score,
					cells: cells
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
		var defaultLabel = getDefaultViewLabel();

		if (!defaultLabel || defaultLabel.length === 0) {
			console.warn("기본(전체기록) 보기 라디오를 찾지 못해 초기화를 건너뜁니다.");
			return;
		}

		console.log("보기 초기화: 기본(전체기록) 보기로 되돌림");

		defaultLabel[0].click();

		await sleep(800);
	}

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

	// 롱기(.left) / 니어(.right) 목록을 현재 DOM에서 읽는다.
	function readDistanceLists() {
		function readSide(sel) {
			var $nicks = $(sel).find(".client_nick.incell_tbl");
			var $scores = $(sel).find(".total_score");
			var cnt = Math.max($nicks.length, $scores.length);
			var list = [];

			for (var i = 0; i < cnt; i++) {
				var nick = cleanNick($nicks.eq(i).text());
				var value = $scores.eq(i).text().trim();

				if (nick === "" && value === "") continue;

				list.push({ nick: nick, value: value, rank: i + 1 });
			}

			return list;
		}

		return { long: readSide(".left"), near: readSide(".right") };
	}

	// 롱기와 니어가 "둘 다" 채워지고, 연속 두 번 같은 결과가 나올 때까지 기다린다.
	// (한쪽만 먼저 렌더링된 상태를 읽어 니어가 통째로 빠지는 문제 방지)
	async function waitForDistanceLists() {
		var prevSig = null;
		var last = null;

		for (var i = 0; i < 16; i++) {
			await sleep(250);

			last = readDistanceLists();

			var sig = JSON.stringify(last);

			if (last.long.length > 0 && last.near.length > 0 && sig === prevSig) {
				return last;
			}

			prevSig = sig;
		}

		console.warn("롱기/니어 목록 대기 시간 초과 (한쪽 기록이 없을 수도 있음)", last);

		return last;
	}

	async function collectLnwRowsFromCourseTab() {
		var lnw = [];

		// 롱기 / 니어 수집
		var distanceLabel = $("label[for='con_distance']");

		if (distanceLabel.length > 0) {
			console.log("롱기/니어 클릭");

			distanceLabel[0].click();

			var dist = await waitForDistanceLists();

			// 롱기: 1위만
			if (dist.long.length > 0) {
				lnw.push({
					type: "LONG",
					label: "롱기",
					nick: dist.long[0].nick,
					value: dist.long[0].value,
					rank: 1
				});
			}

			// 니어: 1위부터 전체 (2위 이후 포함)
			var seenNear = {};

			dist.near.forEach(function (item) {
				// 같은 닉네임이 여러 번 나오면 가장 앞(=가까운) 기록만 사용
				if (item.nick !== "" && seenNear[item.nick]) return;
				seenNear[item.nick] = true;

				lnw.push({
					type: "NEAR",
					label: "니어",
					nick: item.nick,
					value: item.value,
					rank: item.rank
				});
			});

			console.log("니어 수집:", lnw.filter(function (x) { return x.type === "NEAR"; }));
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

			holeSection.find("table tbody tr").each(function () {
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

		// 상단 요약표는 롱기/니어 모두 1위만 표시 (2위 이후는 하단 표에 표시)
		function getLnwText(tab, type) {
			var arr = [];

			(tab.lnw || []).forEach(function (item) {
				if (item.type === type && item.rank === 1) {
					if (item.nick !== "") {
						arr.push(item.nick + " " + item.value);
					} else {
						arr.push(item.value);
					}
				}
			});

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

		html += "</tr>";

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

		html += "</table>";

		return html;
	}

	async function collectSingleCourse() {
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
				if (rows.length > 0) {
					console.log("[합산 1행 td 목록] ", rows[0].cells);
				}

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

		return match ? "[" + match.rank + "] " + match.value : "";
	}

	// 합산 탭 행의 td 구성 (코스 개수 1~3개 모두 대응)
	//   0 순위 | 1 닉네임 | 2 라운드수 | 3 나스모 | 4 ~ (끝-3) 코스별 스코어 | 끝-2 보정치 | 끝-1 최종성적
	//   스트로크 = 코스별 스코어 합계, 보정치 = 끝에서 두 번째 td, 최종스코어 = 마지막 td
	function calcTotalCols(totalRow) {
		var cells = totalRow.cells || [];
		var len = cells.length;

		if (len < 7) {
			return { stroke: "", adj: "", final: "" };
		}

		var sum = 0;
		var cnt = 0;

		for (var k = 4; k <= len - 3; k++) {
			var s = toInt(cells[k]);

			if (s !== null) {
				sum += s;
				cnt++;
			}
		}

		// 보정치 td에는 "15 도움말 실력등급15 시스템보정치0 ..." 처럼 부가 설명이 붙어 있으므로
		// 맨 앞의 숫자(부호 포함)만 사용한다.
		var adjMatch = String(cells[len - 2] || "").match(/^\s*([+-]?\d+)/);
		var adjText = adjMatch ? adjMatch[1] : "";
		var finalText = cells[len - 1];

		var adjNum = toInt(adjText);
		var finalNum = toInt(finalText);

		// 검산: 스트로크 + 보정치 = 최종스코어 가 아니면 경고
		if (cnt > 0 && adjNum !== null && finalNum !== null && sum + adjNum !== finalNum) {
			console.warn("합산 검산 불일치:", totalRow.nick, "스트로크", sum, "보정치", adjNum, "최종", finalNum);
		}

		return {
			stroke: cnt > 0 ? String(sum) : "",
			adj: adjText,
			final: finalText
		};
	}

	// 숫자(타수/기록) 셀: 우측 정렬 + 오른쪽 여백
	function numTd(v) {
		return "<td style='text-align:right !important; padding-right:8px !important;'>" + v + "</td>";
	}

	function numTh(v) {
		return "<td style='text-align:right !important; padding-right:8px !important;'>" + v + "</td>";
	}

	// 니어 합계: 모든 코스에 니어 기록이 있는 사람만 합산하고, 짧은 순으로 순위를 매긴다.
	function calcNearSumRanks(totalTab, otherTabs) {
		var result = {};
		var list = [];

		if (!totalTab || otherTabs.length === 0) return result;

		totalTab.rows.forEach(function (r) {
			var cents = 0;
			var ok = true;

			otherTabs.forEach(function (tab) {
				var m = (tab.lnw || []).filter(function (x) {
					return x.type === "NEAR" && x.nick === r.nick;
				})[0];

				var v = m ? parseFloat(String(m.value).replace(/[^\d.]/g, "")) : NaN;

				if (isNaN(v)) {
					ok = false;
				} else {
					cents += Math.round(v * 100);
				}
			});

			if (ok) {
				list.push({ nick: r.nick, cents: cents });
			}
		});

		list.sort(function (a, b) { return a.cents - b.cents; });

		list.forEach(function (item, idx) {
			// 동점이면 같은 순위
			var rank = (idx > 0 && list[idx - 1].cents === item.cents) ? result[list[idx - 1].nick].rank : idx + 1;

			result[item.nick] = {
				rank: rank,
				text: "[" + rank + "] " + (item.cents / 100).toFixed(2) + "m"
			};
		});

		return result;
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

		var nearSums = calcNearSumRanks(totalTab, otherTabs);

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
			html += "<td colspan='6'>합산</td>";
		}

		html += "<td colspan='2'>多기록</td>";

		otherTabs.forEach(function (tab) {
			html += "<td colspan='3'>" + tab.name + "</td>";
		});

		html += "</tr>";

		html += "<tr>";

		if (totalTab) {
			html += "<td>별명</td>";
			html += numTh("라운드수");
			html += numTh("스트로크");
			html += numTh("보정치");
			html += numTh("최종스코어");
			html += numTh("니어합계");
		}

		html += "<td>별명</td>";
		html += numTh("버디갯수");

		otherTabs.forEach(function (tab) {
			html += "<td>별명</td>";
			html += numTh(tab.name);
			html += numTh("니어");
		});

		html += "</tr>";

		for (var i = 0; i < maxRow; i++) {
			html += "<tr>";
			html += "<td>" + (i + 1) + "</td>";

			if (totalTab) {
				var totalRow = totalTab.rows[i];

				if (totalRow) {
					var t = calcTotalCols(totalRow);

					html += "<td>" + totalRow.nick + "</td>";
					html += numTd(totalRow.value);
					html += numTd(t.stroke);
					html += numTd(t.adj);
					html += numTd(t.final);
					html += numTd(nearSums[totalRow.nick] ? nearSums[totalRow.nick].text : "");
				} else {
					html += "<td></td><td></td><td></td><td></td><td></td><td></td>";
				}
			}

			var buddy = buddyRows[i];

			if (buddy) {
				html += "<td>" + buddy.nick + "</td>";
				html += numTd(buddy.value);
			} else {
				html += "<td></td><td></td>";
			}

			otherTabs.forEach(function (tab) {
				var row = tab.rows[i];

				if (row) {
					html += "<td>" + row.nick + "</td>";
					html += numTd(row.value);
					html += numTd(getNearValueForNick(tab, row.nick));
				} else {
					html += "<td></td><td></td><td></td>";
				}
			});

			html += "</tr>";
		}

		html += "</table>";

		// 니어 기록이 있는데 스코어 표에 닉네임이 없어 누락된 경우 안내
		otherTabs.forEach(function (tab) {
			var names = tab.rows.map(function (r) { return r.nick; });

			(tab.lnw || []).forEach(function (item) {
				if (item.type === "NEAR" && item.nick !== "" && names.indexOf(item.nick) === -1) {
					console.warn(tab.name, "니어 " + item.rank + "위 [" + item.nick + "]은 스코어 표에 없어 하단표에 표시되지 않음");
				}
			});
		});

		var mainHtml = "";

		mainHtml += "<div>" + $(".glf_detail_info h3").text().trim() + "</div>";
		mainHtml += "<div>대회기간:" + $(".status").text().trim() + "</div>";
		mainHtml += "<div>조회일시:" + collectStartTime.toLocaleString('sv') + "</div>";
		mainHtml += "<div style='font-size:11px; color:#888;'>script " + MRN_VERSION + "</div>";

		// 줄바꿈 방지: 모든 셀 nowrap. 표가 화면보다 넓어지면 가로 스크롤로 볼 수 있게 감싼다.
		mainHtml += "<style>#MRN_TABLE td, #MRN_TABLE2 td { white-space: nowrap !important; }</style>";
		mainHtml += "<div style='max-width:100%; overflow-x:auto;'>";
		mainHtml += makeLnwTable(tabResults);
		mainHtml += html;
		mainHtml += "</div>";
		mainHtml += "<div style='font-size:11px;'>* 스트로크 = 코스별 스코어 합계 / 니어합계 = 모든 코스에 니어 기록이 있는 경우만 합산, 짧은 순 순위</div>";

		$("#MRN").append(mainHtml);

		document.getElementById("MRN_TABLE2").scrollIntoView({
			behavior: "smooth",
			block: "start"
		});
	}

	var MRN_STEP = "시작";

	// 모바일처럼 콘솔을 볼 수 없는 환경용: 오류 내용을 알림창과 화면에 표시
	function showError(e) {
		var msg = "오류 단계: " + MRN_STEP + "\n" +
			"메시지: " + (e && e.message ? e.message : e) + "\n" +
			(e && e.stack ? e.stack.split("\n").slice(0, 4).join("\n") : "");

		console.error("실행 오류:", e);

		try {
			if (window.jQuery && $("#MRN").length > 0) {
				$("#MRN").empty().append(
					$("<pre style='white-space:pre-wrap; color:#c00; font-size:12px;'></pre>").text(msg)
				);
			}
		} catch (err) {}

		alert(msg);
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

		MRN_STEP = "데이터 수집";

		var result = await collectTabs();

		MRN_STEP = "표 그리기";

		drawOneTable(result, collectStartTime);

		console.log("전체 수집 완료", result);
	}

	start().catch(showError);

//})();
