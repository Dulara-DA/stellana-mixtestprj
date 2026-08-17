package com.stellana.mixing.api;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.time.Instant;

@RestController
@RequiredArgsConstructor
public class HealthController {
    private final DataSource dataSource;

    @GetMapping("/api/health")
    public ResponseEntity<HealthStatus> health() {
        try (Connection connection = dataSource.getConnection()) {
            boolean databaseAvailable = connection.isValid(2);
            HealthStatus status = new HealthStatus(
                    databaseAvailable ? "UP" : "DOWN",
                    databaseAvailable ? "UP" : "DOWN",
                    Instant.now());
            return ResponseEntity.status(databaseAvailable ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
                    .body(status);
        } catch (Exception exception) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(new HealthStatus("DOWN", "DOWN", Instant.now()));
        }
    }

    public record HealthStatus(String status, String database, Instant timestamp) {
    }
}
