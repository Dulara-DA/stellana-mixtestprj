package com.stellana.mixing.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stellana.mixing.repository.ProductionBatchRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthenticationMockMvcTest {
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired ProductionBatchRepository batchRepository;

    @Test
    void loginReturnsJwtAndAllowsAuthenticatedDashboardAccess() throws Exception {
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"manager@stellana.local","password":"Manager123!"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.user.role").value("MANAGER"))
                .andReturn().getResponse().getContentAsString();

        JsonNode json = objectMapper.readTree(response);
        String token = json.get("token").asText();

        mockMvc.perform(get("/api/dashboard")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeBatches").isNumber())
                .andExpect(jsonPath("$.activeBatchDetails").isArray())
                .andExpect(jsonPath("$.batchBoard").isArray());
    }

    @Test
    void loginAllowsViteDevelopmentOriginFromHotspotAddress() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .header("Origin", "http://172.20.10.2:5173")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"admin@stellana.local","password":"Admin123!"}
                                """))
                .andExpect(status().isOk())
                .andExpect(header().string(
                        "Access-Control-Allow-Origin",
                        "http://172.20.10.2:5173"))
                .andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void protectedEndpointRejectsAnonymousRequest() throws Exception {
        mockMvc.perform(get("/api/batches"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.message").value(
                        "Your session is missing or has expired. Please sign in again."));
    }

    @Test
    void protectedEndpointRejectsInvalidTokenAsExpiredSession() throws Exception {
        mockMvc.perform(get("/api/batches")
                        .header("Authorization", "Bearer invalid-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.message").value(
                        "Your session is missing or has expired. Please sign in again."));
    }

    @Test
    void loginRejectsIncorrectCredentialsAsUnauthorized() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"manager@stellana.local","password":"incorrect-password"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email address or password."));
    }

    @Test
    void authenticatedUserWithoutRequiredRoleReceivesForbidden() throws Exception {
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"officer@stellana.local","password":"Mixing123!"}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = objectMapper.readTree(response).get("token").asText();

        mockMvc.perform(get("/api/users")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.message").value(
                        "You are not authorized to perform this action."));
    }

    @Test
    void blankingOperatorCanLoadSafeEmployeeNumberAndNameOptions() throws Exception {
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"blanking.operator@stellana.local","password":"Blanking123!"}
                                """))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = objectMapper.readTree(response).get("token").asText();

        mockMvc.perform(get("/api/users/blanking-operators")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].employeeId").isNotEmpty())
                .andExpect(jsonPath("$[0].fullName").isNotEmpty())
                .andExpect(jsonPath("$[0].email").doesNotExist());
    }

    @Test
    void safeTraceabilityEndpointIsPublic() throws Exception {
        String code = batchRepository.findAll().getFirst().getTraceabilityCode();
        mockMvc.perform(get("/api/public/trace/{code}", code))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.batchNumber").isNotEmpty())
                .andExpect(jsonPath("$.factoryReference").isNotEmpty())
                .andExpect(jsonPath("$.assignedOfficer").doesNotExist())
                .andExpect(jsonPath("$.traceabilityCode").doesNotExist());
    }
}
