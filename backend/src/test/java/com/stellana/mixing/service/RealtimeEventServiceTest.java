package com.stellana.mixing.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class RealtimeEventServiceTest {
    @Mock
    SimpMessagingTemplate messagingTemplate;

    @InjectMocks
    RealtimeEventService service;

    @AfterEach
    void clearTransactionSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    void publishesProductionEventsImmediatelyOutsideATransaction() {
        service.productionChanged("BLANKING", "BATCH_CREATED", 42L, "Batch 42 created");

        verify(messagingTemplate).convertAndSend(
                org.mockito.ArgumentMatchers.eq("/topic/production"), any(Object.class));
        verify(messagingTemplate).convertAndSend(
                org.mockito.ArgumentMatchers.eq("/topic/blanking"), any(Object.class));
    }

    @Test
    void publishesProductionEventsOnlyAfterTheDatabaseCommit() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);

        service.productionChanged("BLANKING", "BATCH_COMPLETED", 43L, "Batch 43 completed");

        verify(messagingTemplate, never()).convertAndSend(
                org.mockito.ArgumentMatchers.eq("/topic/production"), any(Object.class));
        verify(messagingTemplate, never()).convertAndSend(
                org.mockito.ArgumentMatchers.eq("/topic/blanking"), any(Object.class));

        for (TransactionSynchronization synchronization
                : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }

        verify(messagingTemplate).convertAndSend(
                org.mockito.ArgumentMatchers.eq("/topic/production"), any(Object.class));
        verify(messagingTemplate).convertAndSend(
                org.mockito.ArgumentMatchers.eq("/topic/blanking"), any(Object.class));
    }
}
