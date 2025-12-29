import type { NavItem } from "@/types";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const NavMain = ({ items = [] }: { items: NavItem[] }) => {
  const { setOpenMobile } = useSidebar();

  const redLineClass = cn(
    "hover:bg-red-500/20",
    "hover:border-red-500/40",
    "hover:text-red-500"
  );
  const blueLineClass = cn(
    "hover:bg-blue-500/20",
    "hover:border-blue-500/40",
    "hover:text-blue-500"
  );

  return (
    <SidebarGroup className="px-2 py-0">
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              asChild
              isActive={item.isActive}
              tooltip={item.title}
              size={"lg"}
              onClick={() => setOpenMobile(false)}
            >
              <button
                onClick={() => setOpenMobile(false)}
                className={cn(
                  item.title === "Red Line" ? redLineClass : blueLineClass
                )}
              >
                {item.icon && <item.icon />}
                <p>{item.title}</p>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
};

export default NavMain;
