package com.stellana.mixing.service;

import com.stellana.mixing.api.ApiModels.AuthResponse;
import com.stellana.mixing.api.ApiModels.LoginRequest;
import com.stellana.mixing.api.ApiModels.UserView;
import com.stellana.mixing.config.CustomUserDetailsService;
import com.stellana.mixing.config.JwtService;
import com.stellana.mixing.domain.UserAccount;
import com.stellana.mixing.exception.NotFoundException;
import com.stellana.mixing.repository.UserAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import static com.stellana.mixing.api.ApiMapper.user;

@Service
@RequiredArgsConstructor
public class AuthService {
    private final AuthenticationManager authenticationManager;
    private final CustomUserDetailsService userDetailsService;
    private final JwtService jwtService;
    private final UserAccountRepository userAccountRepository;
    private final CurrentUserService currentUserService;

    public AuthResponse login(LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.email(), request.password()));
        UserDetails details = userDetailsService.loadUserByUsername(request.email());
        UserAccount account = userAccountRepository.findByEmailIgnoreCase(request.email())
                .orElseThrow(() -> new NotFoundException("User not found."));
        return new AuthResponse(jwtService.generateToken(details), user(account));
    }

    public UserView me() {
        return user(currentUserService.requireCurrentUser());
    }
}

