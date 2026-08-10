import { useState, useEffect, useCallback, useRef } from 'react';

type NavState = 'expanded' | 'compact';

export const useLiquidGlassNavigation = (threshold = 30) => {
  const [navState, setNavState] = useState<NavState>('expanded');
  const lastScrollY = useRef(0);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;
    
    // Ignore small movements within the threshold or bounces at the top of the page
    if (currentScrollY <= 0) {
      setNavState('expanded');
      lastScrollY.current = currentScrollY;
      return;
    }

    const distance = currentScrollY - lastScrollY.current;

    if (Math.abs(distance) > threshold) {
      if (distance > 0) {
        // Scrolling down
        setNavState('compact');
      } else {
        // Scrolling up
        setNavState('expanded');
      }
      lastScrollY.current = currentScrollY;
    }

    // Reset to expanded if scroll stops at the top
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }
    
    scrollTimeout.current = setTimeout(() => {
      // If we are at the top, ensure it's expanded
      if (window.scrollY < 50) {
        setNavState('expanded');
      }
    }, 1000);
    
  }, [threshold]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, [handleScroll]);

  // Expose a manual override setter in case of interaction (e.g. tap to expand)
  return {
    navState,
    setNavState,
  };
};
