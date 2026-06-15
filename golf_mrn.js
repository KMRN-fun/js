var wholeScore = "";
var subTabName = "";
var tableRow = "";
var tableCnt = 0;
var tableName = "";

function loadScript(src) {
    return new Promise(function(resolve, reject) {
        if (document.querySelector('script[src="' + src + '"]')) {
            resolve();
            return;
        }

        var script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;

        document.head.appendChild(script);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

loadScript("https://code.jquery.com/jquery-3.7.1.min.js")
    .then(async function () {

        if ($("#MRN").length === 0) {
            $("#ranking_list").append("<div id='MRN'></div>");
        } else {
            $("#MRN").empty();
        }

        await get();

    })
    .catch(function () {
        console.error("로드 실패");
    });

async function get() {

    var tabs = $(".gft_sub_tab ul li a").toArray();

    for (var i = 0; i < tabs.length; i++) {

        var tab = tabs[i];
        var tabId = $(tab).attr("id");

        console.log("탭 클릭:", tabId);

        document.getElementById(tabId).click();

        await sleep(1000);

        subTabName = $(".gft_sub_tab").find(".on").text().trim();

        console.log("현재 탭:", subTabName);

        tableName = "TABLE_" + (++tableCnt);

        $("#MRN").append("<table id='" + tableName + "' border='1'></table>");

        tableRow =
            "<tr><td colspan='2'>" + subTabName + "</td></tr>" +
            "<tr>" +
            "   <td>별명</td>" +
            "   <td>" + (subTabName == "합산" ? "라운드수" : subTabName) + "</td>" +
            "</tr>";

        $("#" + tableName).append(tableRow);

        console.log("별명," + (subTabName == "합산" ? "라운드수" : subTabName));

        await getPages(tableName, subTabName);
    }

    console.log("전체 완료");
}

async function getPages(tableName, subTabName) {

    // 첫 페이지 먼저 수집
    collectRows(tableName, subTabName);

    // 페이징 번호 수집
    var pageLinks = $("#divpagearea a").toArray();

    if (pageLinks.length === 0) {
        pageLinks = $("#miniround_paging a").toArray();
    }

    for (var p = 0; p < pageLinks.length; p++) {

        // DOM 바뀔 수 있으니 매번 다시 조회
        var pages = $("#divpagearea a").toArray();

        if (pages.length === 0) {
            pages = $("#miniround_paging a").toArray();
        }

        var page = pages[p];

        if (!page) continue;

        var pageNo = $(page).text().trim();

        // 숫자 페이지만 처리
        if (pageNo === "" || isNaN(pageNo)) continue;

        // 현재 활성 페이지면 이미 수집했으니 skip
        if ($(page).hasClass("ui-state-active") || $(page).parent().hasClass("on")) {
            continue;
        }

        console.log("페이지 클릭:", subTabName, pageNo);

        page.click();

        await sleep(1000);

        collectRows(tableName, subTabName);
    }
}

function collectRows(tableName, subTabName) {

    $(".record_td tr").each(function () {

        var nick = $(this).find("td:eq(1)").text().trim();
        var roundCnt = $(this).find("td:eq(2)").text().trim();
        var score = $(this).find("td:eq(4)").text().trim();

        if (nick.indexOf("(") > -1) {
            nick = nick.substring(0, nick.indexOf("("));
        }

        nick = nick.trim();

        if (nick != "") {

            tableRow =
                "<tr>" +
                "   <td>" + nick + "</td>" +
                "   <td>" + (subTabName == "합산" ? roundCnt : score) + "</td>" +
                "</tr>";

            $("#" + tableName).append(tableRow);

            console.log(
                subTabName + "," +
                nick + "," +
                (subTabName == "합산" ? roundCnt : score)
            );
        }
    });
}