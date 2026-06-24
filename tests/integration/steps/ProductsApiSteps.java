package steps;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.notNullValue;

import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import io.restassured.RestAssured;
import io.restassured.builder.RequestSpecBuilder;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.util.List;

/**
 * Rest Assured step definitions for the product catalog feature.
 *
 * Per .cursor/rules/integration-gherkin.mdc: base URI lives in a shared request
 * spec, assertions live in steps (not the .feature), and the environment URL is
 * read from configuration rather than hardcoded.
 */
public class ProductsApiSteps {

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
    List<String> names = response.then().statusCode(200).extract().jsonPath().getList("items.name");
    for (String name : names) {
      org.junit.jupiter.api.Assertions.assertTrue(
          name.toLowerCase().contains(query.toLowerCase()),
          "Expected product '" + name + "' to match query '" + query + "'");
    }
  }
}
