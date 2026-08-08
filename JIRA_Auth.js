function testJiraAuth() {
  var email = "redacted@example.com";
  var apiToken = PropertiesService.getScriptProperties().getProperty("NEW_TOKEN");;

  var url = "https://YOUR-COMPANY.atlassian.net/rest/api/3/myself";

  var auth = Utilities.base64Encode(email + ":" + apiToken);

  var options = {
    method: "get",
    headers: {
      "Authorization": "Basic " + auth,
      "Accept": "application/json"
    },
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  Logger.log(response.getContentText());
}