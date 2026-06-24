package steps;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.closeTo;
import static org.hamcrest.Matchers.containsStringIgnoringCase;
import static org.hamcrest.Matchers.equalTo;

import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import io.restassured.builder.RequestSpecBuilder;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.util.Map;

/**
 * Rest Assured step definitions for the discount-code API (ADO #1).
 * Status and body are asserted separately; base URI comes from configuration.
 */
public class DiscountApiSteps {

  private static final String BASE_URI =
      System.getProperty("api.baseUri", System.getenv().getOrDefault("API_BASE_URI", "http://127.0.0.1:8000"));

  private final RequestSpecification spec =
      new RequestSpecBuilder().setBaseUri(BASE_URI).setContentType(ContentType.JSON).build();

  private Response response;

  @Given("the checkout service is available")
  public void the_checkout_service_is_available() {
    given().spec(spec).when().get("/api/health").then().statusCode(200);
  }

  @When("I validate the code {string} against a subtotal of {double}")
  public void i_validate_the_code(String code, Double subtotal) {
    response =
        given()
            .spec(spec)
            .body(Map.of("code", code, "subtotal", subtotal))
            .when()
            .post("/api/discount/validate");
  }

  @Then("the code is accepted")
  public void the_code_is_accepted() {
    response.then().statusCode(200).body("valid", equalTo(true));
  }

  @Then("the discount amount is {double}")
  public void the_discount_amount_is(Double amount) {
    response.then().body("discount_amount", closeTo(amount, 0.001));
  }

  @Then("the new total is {double}")
  public void the_new_total_is(Double total) {
    response.then().body("new_total", closeTo(total, 0.001));
  }

  @Then("the code is rejected")
  public void the_code_is_rejected() {
    response.then().statusCode(400);
  }

  @Then("the rejection reason mentions {string}")
  public void the_rejection_reason_mentions(String reason) {
    response.then().body("detail", containsStringIgnoringCase(reason));
  }
}
