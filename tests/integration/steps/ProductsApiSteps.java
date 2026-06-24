package steps;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.notNullValue;

import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import io.restassured.builder.RequestSpecBuilder;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Rest Assured step definitions for the product catalog feature.
 *
 * Per .cursor/rules/integration-gherkin.mdc: base URI lives in a shared request
 * spec, assertions live in steps (not the .feature), and the environment URL is
 * read from configuration rather than hardcoded.
 */
public class ProductsApiSteps {
  private static final Pattern TOKEN_PATTERN = Pattern.compile("[a-z0-9]+");

  private static final String BASE_URI =
      System.getProperty("api.baseUri", System.getenv().getOrDefault("API_BASE_URI", "http://127.0.0.1:8000"));

  private final RequestSpecification spec =
      new RequestSpecBuilder().setBaseUri(BASE_URI).build();

  private Response response;

  @Given("the catalog service is available")
  public void the_catalog_service_is_available() {
    given().spec(spec).when().get("/api/health").then().statusCode(200);
  }

  @When("I request the product list")
  public void i_request_the_product_list() {
    response = given().spec(spec).when().get("/api/products");
  }

  @When("I search the catalog for {string}")
  public void i_search_the_catalog_for(String query) {
    response = given().spec(spec).queryParam("query", query).when().get("/api/products");
  }

  @Then("the response contains at least one product")
  public void the_response_contains_at_least_one_product() {
    response.then().statusCode(200).body("count", greaterThanOrEqualTo(1));
  }

  @Then("every product has a name and a price")
  public void every_product_has_a_name_and_a_price() {
    response.then().body("items.name", notNullValue()).body("items.price", notNullValue());
  }

  @Then("every returned product matches {string}")
  public void every_returned_product_matches(String query) {
    List<Map<String, Object>> items = response.then().statusCode(200).extract().jsonPath().getList("items");
    for (Map<String, Object> item : items) {
      String name = String.valueOf(item.getOrDefault("name", ""));
      String description = String.valueOf(item.getOrDefault("description", ""));
      org.junit.jupiter.api.Assertions.assertTrue(
          matchesPartialTerms(name + " " + description, query),
          "Expected product '" + name + "' to match query '" + query + "'");
    }
  }

  private static boolean matchesPartialTerms(String searchableText, String query) {
    List<String> queryTerms = tokenize(query);
    if (queryTerms.isEmpty()) {
      return true;
    }

    List<String> productTerms = tokenize(searchableText);
    if (productTerms.isEmpty()) {
      return false;
    }

    for (String term : queryTerms) {
      boolean matched = false;
      for (String token : productTerms) {
        if (token.contains(term)) {
          matched = true;
          break;
        }
      }
      if (!matched) {
        return false;
      }
    }
    return true;
  }

  private static List<String> tokenize(String text) {
    List<String> tokens = new ArrayList<>();
    Matcher matcher = TOKEN_PATTERN.matcher(text.toLowerCase());
    while (matcher.find()) {
      tokens.add(matcher.group());
    }
    return tokens;
  }
}
